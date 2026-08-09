"""Resolve artist profile images: local files then remote cascade.

Order: local artist.jpg/png → MusicBrainz → Last.fm → fanart.tv.
APIs only (no HTML scraping).
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from musicweb.artist_image import ArtistImageStore
from musicweb.config import (
    ARTIST_IMAGE_FETCH,
    ARTIST_IMAGE_MAX_BYTES,
    ARTIST_IMAGE_MIN_INTERVAL_MS,
    ARTIST_IMAGE_RETRY_DAYS,
    Settings,
)
from musicweb.db.models import Artist, Track
from musicweb.db.names import normalize_name
from musicweb.library import Library

logger = logging.getLogger(__name__)

# Case-insensitive match set for directory listing (not folder.jpg/cover.jpg).
_LOCAL_NAME_SET = {n.casefold() for n in ("artist.jpg", "artist.jpeg", "artist.png")}

# Last.fm placeholder / star assets (third-party keys often return these).
_LASTFM_PLACEHOLDER_MARKERS = (
    "2a96cbd8b46e442fc41c2b86b821562f",
    "default_avatar",
    "/serve/64s/2a96cbd8",
    "lastfm.freetls.fastly.net/i/u/64s/",
    "lastfm.freetls.fastly.net/i/u/174s/2a96cbd8",
)

HTTP_TIMEOUT_S = 20.0


@dataclass
class FetchResult:
    ok: bool
    source: str | None = None  # local | musicbrainz | lastfm | fanarttv
    status: str = "not_found"  # ok | not_found | error
    mbid: str | None = None
    detail: str | None = None


class RateLimitedHttp:
    """Simple GET client with a global min interval between requests."""

    def __init__(self, min_interval_ms: int, default_user_agent: str) -> None:
        self._min_interval = max(0, min_interval_ms) / 1000.0
        self._default_ua = default_user_agent
        self._last_at = 0.0

    def _throttle(self) -> None:
        if self._min_interval <= 0:
            return
        now = time.monotonic()
        wait = self._min_interval - (now - self._last_at)
        if wait > 0:
            time.sleep(wait)

    def get_bytes(
        self,
        url: str,
        *,
        user_agent: str | None = None,
        accept: str = "*/*",
        max_bytes: int = ARTIST_IMAGE_MAX_BYTES,
    ) -> tuple[int, bytes, str | None]:
        """Return (status_code, body, content_type). Raises on transport errors."""
        self._throttle()
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": user_agent or self._default_ua,
                "Accept": accept,
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
                status = getattr(resp, "status", 200) or 200
                ctype = resp.headers.get("Content-Type")
                chunks: list[bytes] = []
                total = 0
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError(f"response exceeds {max_bytes} bytes")
                    chunks.append(chunk)
                self._last_at = time.monotonic()
                return status, b"".join(chunks), ctype
        except urllib.error.HTTPError as exc:
            self._last_at = time.monotonic()
            body = b""
            try:
                body = exc.read(max_bytes)
            except Exception:
                pass
            return exc.code, body, exc.headers.get("Content-Type") if exc.headers else None

    def get_json(
        self, url: str, *, user_agent: str | None = None
    ) -> tuple[int, dict | list | None]:
        status, body, _ = self.get_bytes(
            url, user_agent=user_agent, accept="application/json"
        )
        if not body:
            return status, None
        try:
            return status, json.loads(body.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            return status, None


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        text = value.replace("Z", "+00:00")
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _in_retry_cooldown(artist: Artist, *, now: datetime | None = None) -> bool:
    # Only cool down real attempts — not "skipped" (no keys / no contact yet).
    if artist.image_status not in ("not_found", "error"):
        return False
    fetched = _parse_iso(artist.image_fetched_at)
    if fetched is None:
        return False
    now = now or datetime.now(timezone.utc)
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    return now < fetched + timedelta(days=ARTIST_IMAGE_RETRY_DAYS)


def _looks_like_image(data: bytes, content_type: str | None) -> bool:
    if len(data) < 24:
        return False
    if data[:3] == b"\xff\xd8\xff":
        return True
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return True
    if content_type and content_type.split(";")[0].strip().lower().startswith("image/"):
        return True
    return False


def _find_local_artist_file(start_dir: Path, library_root: Path) -> Path | None:
    """Walk up from start_dir toward library root looking for artist.jpg/png only."""
    try:
        current = start_dir.resolve()
        root = library_root.resolve()
    except OSError:
        return None

    for _ in range(8):
        try:
            if not current.is_dir():
                current = current.parent
                continue
        except OSError:
            break

        # Prefer exact common names first.
        for name in ("artist.jpg", "artist.jpeg", "artist.png"):
            candidate = current / name
            try:
                if candidate.is_file() and candidate.stat().st_size > 0:
                    return candidate
            except OSError:
                pass

        # Case-insensitive scan of this directory only (no globs of all images).
        try:
            for entry in current.iterdir():
                if not entry.is_file():
                    continue
                if entry.name.casefold() in _LOCAL_NAME_SET:
                    try:
                        if entry.stat().st_size > 0:
                            return entry
                    except OSError:
                        continue
        except OSError:
            pass

        if current == root:
            break
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def _sample_audio_dir(
    session: Session, library: Library, artist_id: str
) -> Path | None:
    track = session.execute(
        select(Track)
        .where(
            Track.album_artist_id == artist_id,
            Track.is_missing.is_(False),
            Track.rel_path.is_not(None),
        )
        .limit(1)
    ).scalar_one_or_none()
    if track is None:
        track = session.execute(
            select(Track)
            .where(
                Track.artist_id == artist_id,
                Track.is_missing.is_(False),
                Track.rel_path.is_not(None),
            )
            .limit(1)
        ).scalar_one_or_none()
    if track is None or not track.rel_path:
        return None
    try:
        path = library.resolve(track.rel_path)
        if path.is_file():
            return path.parent
    except Exception:
        return None
    return None


def _is_lastfm_placeholder(url: str) -> bool:
    lower = url.lower()
    return any(m in lower for m in _LASTFM_PLACEHOLDER_MARKERS)


def _best_lastfm_image(images: list) -> str | None:
    # Prefer largest known sizes first.
    size_rank = {"mega": 5, "extralarge": 4, "large": 3, "medium": 2, "small": 1, "": 0}
    ranked: list[tuple[int, str]] = []
    for item in images or []:
        if not isinstance(item, dict):
            continue
        url = (item.get("#text") or item.get("text") or "").strip()
        if not url or not url.startswith("http"):
            continue
        if _is_lastfm_placeholder(url):
            continue
        size = (item.get("size") or "").lower()
        ranked.append((size_rank.get(size, 0), url))
    if not ranked:
        return None
    ranked.sort(key=lambda x: x[0], reverse=True)
    return ranked[0][1]


def _pick_musicbrainz_artist(payload: dict, name_norm: str) -> dict | None:
    artists = payload.get("artists") if isinstance(payload, dict) else None
    if not isinstance(artists, list) or not artists:
        return None

    exact: list[dict] = []
    for a in artists:
        if not isinstance(a, dict):
            continue
        score = int(a.get("score") or 0)
        a_norm = normalize_name(a.get("name") or "")
        if a_norm == name_norm and score >= 90:
            exact.append(a)
        elif a_norm == name_norm:
            exact.append(a)

    if exact:
        exact.sort(key=lambda a: int(a.get("score") or 0), reverse=True)
        return exact[0]

    # Fall back to highest score if reasonably confident.
    best = max(
        (a for a in artists if isinstance(a, dict)),
        key=lambda a: int(a.get("score") or 0),
        default=None,
    )
    if best is not None and int(best.get("score") or 0) >= 95:
        return best
    return None


def _mb_image_url_from_lookup(payload: dict) -> str | None:
    """Extract a direct image URL from artist relations if present."""
    relations = payload.get("relations") if isinstance(payload, dict) else None
    if not isinstance(relations, list):
        return None
    for rel in relations:
        if not isinstance(rel, dict):
            continue
        if (rel.get("type") or "").lower() != "image":
            continue
        url_obj = rel.get("url")
        href = None
        if isinstance(url_obj, dict):
            href = url_obj.get("resource")
        elif isinstance(url_obj, str):
            href = url_obj
        if not href or not href.startswith("http"):
            continue
        # Wikimedia Commons file pages → Special:FilePath redirect.
        if "commons.wikimedia.org/wiki/File:" in href:
            file_name = href.rsplit("File:", 1)[-1]
            file_name = urllib.parse.unquote(file_name)
            return (
                "https://commons.wikimedia.org/wiki/Special:FilePath/"
                + urllib.parse.quote(file_name)
            )
        if any(
            href.lower().endswith(ext)
            for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif")
        ):
            return href
        if "upload.wikimedia.org" in href:
            return href
    return None


class ArtistImageFetcher:
    """Fetch and persist artist images during library scan."""

    def __init__(
        self,
        store: ArtistImageStore,
        library: Library,
        settings: Settings,
    ) -> None:
        self._store = store
        self._library = library
        self._settings = settings
        ua = settings.musicbrainz_user_agent() or (
            "MusicLibaryWeb/0.1 - https://github.com/lucrnz/music-library-web"
        )
        self._http = RateLimitedHttp(ARTIST_IMAGE_MIN_INTERVAL_MS, ua)
        self._mb_ua = settings.musicbrainz_user_agent()

    def _remote_available(self) -> bool:
        """True if at least one remote provider can run."""
        if self._mb_ua:
            return True
        if self._settings.lastfm_api_key:
            return True
        if self._settings.fanart_tv_api_key:
            return True
        return False

    def needs_fetch(self, artist: Artist) -> bool:
        if not ARTIST_IMAGE_FETCH:
            return False
        if artist.has_image and self._store.has_image(artist.id):
            return False
        # Files vanished but DB still says has_image → re-fetch.
        if artist.has_image and not self._store.has_image(artist.id):
            return True
        if _in_retry_cooldown(artist):
            return False
        return True

    def fetch_one(
        self,
        session: Session,
        artist: Artist,
        *,
        cancel: Callable[[], bool] | None = None,
    ) -> FetchResult:
        """Resolve image for one artist; updates DB fields on the ORM object."""
        if cancel and cancel():
            return FetchResult(ok=False, status="error", detail="canceled")

        # Already on disk — sync flags.
        if self._store.has_image(artist.id):
            artist.has_image = True
            if artist.image_status != "ok":
                artist.image_status = "ok"
            return FetchResult(ok=True, source=artist.image_source or "local", status="ok")

        mbid = artist.mbid
        result = FetchResult(ok=False, status="not_found", mbid=mbid)

        # 1) Local
        local = self._try_local(session, artist)
        if local is not None:
            return local

        if cancel and cancel():
            return FetchResult(ok=False, status="error", detail="canceled", mbid=mbid)

        attempted_remote = False

        # 2) MusicBrainz (MBID + optional image)
        if self._mb_ua:
            attempted_remote = True
            mb = self._try_musicbrainz(artist)
            if mb.mbid:
                mbid = mb.mbid
                artist.mbid = mb.mbid
                result.mbid = mb.mbid
            if mb.ok:
                return mb
            if mb.status == "error" and mb.detail == "rate_limited":
                # Continue cascade without MB image.
                pass
            elif mb.status == "error":
                result = mb
            elif mb.status == "not_found":
                result = mb

        if cancel and cancel():
            return FetchResult(ok=False, status="error", detail="canceled", mbid=mbid)

        # 3) Last.fm
        if self._settings.lastfm_api_key:
            attempted_remote = True
            lf = self._try_lastfm(artist, mbid=mbid)
            if lf.ok:
                return lf
            if lf.mbid:
                mbid = lf.mbid
            result = lf

        if cancel and cancel():
            return FetchResult(ok=False, status="error", detail="canceled", mbid=mbid)

        # 4) fanart.tv (needs MBID + key)
        if self._settings.fanart_tv_api_key and mbid:
            attempted_remote = True
            fa = self._try_fanart(artist, mbid=mbid)
            if fa.ok:
                return fa
            result = fa
        elif self._settings.fanart_tv_api_key and not mbid:
            # Key present but no MBID — still a real attempt outcome.
            if not attempted_remote:
                result = FetchResult(
                    ok=False, status="not_found", mbid=None, detail="no_mbid_for_fanart"
                )

        artist.has_image = False
        artist.image_source = None
        if mbid:
            artist.mbid = mbid

        if not attempted_remote and not self._remote_available():
            # No keys/contact yet — do not cool down; retry when configured.
            artist.image_status = "skipped"
            artist.image_fetched_at = None
            return FetchResult(ok=False, status="skipped", mbid=mbid, detail="no_providers")

        artist.image_status = result.status if result.status in ("not_found", "error") else "not_found"
        artist.image_fetched_at = _utc_now()
        return result

    def _persist(
        self, artist: Artist, data: bytes, source: str, *, mbid: str | None = None
    ) -> FetchResult:
        ok = self._store.ensure_from_bytes(artist.id, data)
        if not ok:
            artist.has_image = False
            artist.image_source = None
            artist.image_status = "error"
            artist.image_fetched_at = _utc_now()
            return FetchResult(ok=False, status="error", source=source, mbid=mbid, detail="encode")
        artist.has_image = True
        artist.image_source = source
        artist.image_status = "ok"
        artist.image_fetched_at = _utc_now()
        if mbid:
            artist.mbid = mbid
        return FetchResult(ok=True, source=source, status="ok", mbid=mbid)

    def _try_local(self, session: Session, artist: Artist) -> FetchResult | None:
        folder = _sample_audio_dir(session, self._library, artist.id)
        if folder is None:
            return None
        path = _find_local_artist_file(folder, self._library.root)
        if path is None:
            return None
        try:
            data = path.read_bytes()
        except OSError as exc:
            logger.debug("local artist image read failed %s: %s", path, exc)
            return None
        if not _looks_like_image(data, None):
            return None
        return self._persist(artist, data, "local")

    def _try_musicbrainz(self, artist: Artist) -> FetchResult:
        if not self._mb_ua:
            return FetchResult(ok=False, status="not_found", detail="no_mb_contact")

        # Search
        query = f'artist:"{artist.name}"'
        params = urllib.parse.urlencode({"query": query, "fmt": "json", "limit": "5"})
        search_url = f"https://musicbrainz.org/ws/2/artist?{params}"
        try:
            status, payload = self._http.get_json(search_url, user_agent=self._mb_ua)
        except Exception as exc:
            logger.debug("musicbrainz search failed for %s: %s", artist.name, exc)
            return FetchResult(ok=False, status="error", detail=str(exc)[:200])

        if status in (429, 503):
            return FetchResult(ok=False, status="error", detail="rate_limited")
        if status != 200 or not isinstance(payload, dict):
            return FetchResult(ok=False, status="error", detail=f"http_{status}")

        match = _pick_musicbrainz_artist(payload, artist.name_norm)
        if match is None:
            return FetchResult(ok=False, status="not_found", detail="no_mb_match")

        mbid = match.get("id")
        if not mbid:
            return FetchResult(ok=False, status="not_found", detail="no_mbid")

        artist.mbid = str(mbid)

        # Lookup with url-rels for image relation.
        lookup_params = urllib.parse.urlencode(
            {"fmt": "json", "inc": "url-rels"}
        )
        lookup_url = f"https://musicbrainz.org/ws/2/artist/{mbid}?{lookup_params}"
        try:
            status, detail = self._http.get_json(lookup_url, user_agent=self._mb_ua)
        except Exception as exc:
            logger.debug("musicbrainz lookup failed for %s: %s", mbid, exc)
            return FetchResult(ok=False, status="not_found", mbid=str(mbid), detail=str(exc)[:200])

        if status in (429, 503):
            return FetchResult(ok=False, status="error", mbid=str(mbid), detail="rate_limited")
        if status != 200 or not isinstance(detail, dict):
            return FetchResult(ok=False, status="not_found", mbid=str(mbid))

        image_url = _mb_image_url_from_lookup(detail)
        if not image_url:
            return FetchResult(ok=False, status="not_found", mbid=str(mbid), detail="no_mb_image")

        return self._download_and_persist(artist, image_url, "musicbrainz", mbid=str(mbid))

    def _try_lastfm(self, artist: Artist, *, mbid: str | None) -> FetchResult:
        key = self._settings.lastfm_api_key
        if not key:
            return FetchResult(ok=False, status="not_found", mbid=mbid, detail="no_lastfm_key")

        params: dict[str, str] = {
            "method": "artist.getinfo",
            "api_key": key,
            "format": "json",
        }
        if mbid:
            params["mbid"] = mbid
        else:
            params["artist"] = artist.name
        url = "https://ws.audioscrobbler.com/2.0/?" + urllib.parse.urlencode(params)
        try:
            status, payload = self._http.get_json(url)
        except Exception as exc:
            logger.debug("lastfm getinfo failed for %s: %s", artist.name, exc)
            return FetchResult(ok=False, status="error", mbid=mbid, detail=str(exc)[:200])

        if status == 429:
            return FetchResult(ok=False, status="error", mbid=mbid, detail="rate_limited")
        if status != 200 or not isinstance(payload, dict):
            return FetchResult(ok=False, status="error", mbid=mbid, detail=f"http_{status}")

        if payload.get("error"):
            # 6 = not found
            err = payload.get("error")
            if err == 6:
                return FetchResult(ok=False, status="not_found", mbid=mbid)
            return FetchResult(ok=False, status="error", mbid=mbid, detail=str(err))

        info = payload.get("artist")
        if not isinstance(info, dict):
            return FetchResult(ok=False, status="not_found", mbid=mbid)

        # Prefer MBID from Last.fm if we lack one.
        lf_mbid = info.get("mbid") or mbid
        if lf_mbid and not artist.mbid:
            artist.mbid = str(lf_mbid)
            mbid = str(lf_mbid)

        image_url = _best_lastfm_image(info.get("image") or [])
        if not image_url:
            return FetchResult(ok=False, status="not_found", mbid=mbid, detail="no_lastfm_image")

        return self._download_and_persist(
            artist, image_url, "lastfm", mbid=str(lf_mbid) if lf_mbid else mbid
        )

    def _try_fanart(self, artist: Artist, *, mbid: str) -> FetchResult:
        key = self._settings.fanart_tv_api_key
        if not key:
            return FetchResult(ok=False, status="not_found", mbid=mbid, detail="no_fanart_key")

        url = f"https://webservice.fanart.tv/v3/music/{urllib.parse.quote(mbid)}"
        # fanart.tv accepts api key as query or header; query is fine.
        url += "?" + urllib.parse.urlencode({"api_key": key})
        try:
            status, payload = self._http.get_json(url)
        except Exception as exc:
            logger.debug("fanart.tv failed for %s: %s", mbid, exc)
            return FetchResult(ok=False, status="error", mbid=mbid, detail=str(exc)[:200])

        if status in (429, 503):
            return FetchResult(ok=False, status="error", mbid=mbid, detail="rate_limited")
        if status == 404:
            return FetchResult(ok=False, status="not_found", mbid=mbid)
        if status != 200 or not isinstance(payload, dict):
            return FetchResult(ok=False, status="error", mbid=mbid, detail=f"http_{status}")

        image_url = _fanart_artist_thumb(payload)
        if not image_url:
            return FetchResult(ok=False, status="not_found", mbid=mbid, detail="no_fanart_image")

        return self._download_and_persist(artist, image_url, "fanarttv", mbid=mbid)

    def _download_and_persist(
        self, artist: Artist, url: str, source: str, *, mbid: str | None
    ) -> FetchResult:
        try:
            status, body, ctype = self._http.get_bytes(url)
        except Exception as exc:
            logger.debug("image download failed %s: %s", url, exc)
            return FetchResult(
                ok=False, status="error", source=source, mbid=mbid, detail=str(exc)[:200]
            )
        if status != 200 or not body or not _looks_like_image(body, ctype):
            return FetchResult(
                ok=False,
                status="not_found",
                source=source,
                mbid=mbid,
                detail=f"bad_image_{status}",
            )
        return self._persist(artist, body, source, mbid=mbid)


def _fanart_artist_thumb(payload: dict) -> str | None:
    """Prefer portrait thumbs; fall back to background or logo."""

    def best_url(items: object) -> str | None:
        if not isinstance(items, list):
            return None
        ranked = [i for i in items if isinstance(i, dict) and i.get("url")]
        if not ranked:
            return None

        def likes(item: dict) -> int:
            try:
                return int(item.get("likes") or 0)
            except (TypeError, ValueError):
                return 0

        ranked.sort(key=likes, reverse=True)
        url = str(ranked[0].get("url") or "")
        return url if url.startswith("http") else None

    for key in ("artistthumb", "artistbackground", "hdmusiclogo", "musiclogo"):
        url = best_url(payload.get(key))
        if url:
            return url
    return None
