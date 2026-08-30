"""MusicBrainz discid + Cover Art Archive lookups."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

from musicweb.config import ARTIST_IMAGE_MAX_BYTES, ARTIST_IMAGE_MIN_INTERVAL_MS
from musicweb.http_client import RateLimitedHttp, looks_like_image

logger = logging.getLogger(__name__)

MB_DISCID_URL = "https://musicbrainz.org/ws/2/discid/{discid}?inc=artists+recordings+release-groups+labels+discids&fmt=json"
MB_RELEASE_URL = "https://musicbrainz.org/ws/2/release/{mbid}?inc=artists+recordings+labels&fmt=json"
CAA_FRONT_URL = "https://coverartarchive.org/release/{mbid}/front"


@dataclass(frozen=True)
class MatchTrack:
    track_no: int
    title: str
    artist: str
    duration_ms: int | None


@dataclass(frozen=True)
class ReleaseMatch:
    release_mbid: str
    title: str
    artist: str
    year: int | None
    country: str | None
    label: str | None
    track_count: int
    tracks: list[MatchTrack] = field(default_factory=list)
    medium_position: int = 1

    def to_picker_dict(self) -> dict[str, Any]:
        return {
            "release_mbid": self.release_mbid,
            "title": self.title,
            "artist": self.artist,
            "year": self.year,
            "country": self.country,
            "label": self.label,
            "track_count": self.track_count,
            "tracks": [
                {
                    "track_no": t.track_no,
                    "title": t.title,
                    "artist": t.artist,
                    "duration_ms": t.duration_ms,
                }
                for t in self.tracks
            ],
        }


_shared_http: RateLimitedHttp | None = None


def shared_http(user_agent: str) -> RateLimitedHttp:
    global _shared_http
    if _shared_http is None:
        _shared_http = RateLimitedHttp(ARTIST_IMAGE_MIN_INTERVAL_MS, user_agent)
    return _shared_http


def default_http(user_agent: str) -> RateLimitedHttp:
    return shared_http(user_agent)


def _artist_credit(payload: dict) -> str:
    credits = payload.get("artist-credit") or []
    names: list[str] = []
    for item in credits:
        if isinstance(item, dict):
            name = str(item.get("name") or "")
            if not name and isinstance(item.get("artist"), dict):
                name = str(item["artist"].get("name") or "")
            join = str(item.get("joinphrase") or "")
            if name:
                names.append(name + join)
    return "".join(names).strip() or "Unknown Artist"


def _year(payload: dict) -> int | None:
    raw = str(payload.get("date") or "")[:4]
    if raw.isdigit():
        year = int(raw)
        if 1000 <= year <= 9999:
            return year
    return None


def _label(payload: dict) -> str | None:
    infos = payload.get("label-info") or []
    for info in infos:
        if not isinstance(info, dict):
            continue
        label = info.get("label")
        if isinstance(label, dict):
            name = str(label.get("name") or "").strip()
            if name:
                return name
    return None


def _media_list(payload: dict) -> list[dict]:
    raw = payload.get("media") or []
    return [item for item in raw if isinstance(item, dict)]


def _medium_track_count(medium: dict) -> int:
    raw = medium.get("track-count")
    if isinstance(raw, int):
        return raw
    tracks = medium.get("tracks") or []
    return len(tracks) if isinstance(tracks, list) else 0


def _medium_has_discid(medium: dict, discid: str) -> bool:
    for disc in medium.get("discs") or []:
        if isinstance(disc, dict) and str(disc.get("id") or "") == discid:
            return True
    return False


def select_medium(
    payload: dict,
    *,
    discid: str | None = None,
    audio_count: int | None = None,
) -> tuple[dict, int]:
    media = _media_list(payload)
    if not media:
        return {}, 1
    if discid:
        for index, medium in enumerate(media):
            if _medium_has_discid(medium, discid):
                return medium, index + 1
    if audio_count is not None:
        for index, medium in enumerate(media):
            if _medium_track_count(medium) == audio_count:
                return medium, index + 1
    return media[0], 1


def _tracks_from_medium(medium: dict, fallback_artist: str) -> list[MatchTrack]:
    rows = medium.get("tracks") or []
    out: list[MatchTrack] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            continue
        number = row.get("number")
        try:
            track_no = int(str(number)) if number is not None else index
        except ValueError:
            track_no = index
        rec = row.get("recording") if isinstance(row.get("recording"), dict) else {}
        title = str(row.get("title") or rec.get("title") or f"Track {track_no}")
        artist = _artist_credit(row) if row.get("artist-credit") else fallback_artist
        length = row.get("length")
        if length is None:
            length = rec.get("length")
        duration_ms = int(length) if isinstance(length, (int, float)) else None
        out.append(
            MatchTrack(
                track_no=track_no,
                title=title,
                artist=artist or fallback_artist,
                duration_ms=duration_ms,
            )
        )
    return out


def release_from_payload(
    payload: dict,
    *,
    discid: str | None = None,
    audio_count: int | None = None,
) -> ReleaseMatch | None:
    mbid = str(payload.get("id") or "")
    title = str(payload.get("title") or "").strip()
    if not mbid or not title:
        return None
    artist = _artist_credit(payload)
    medium, position = select_medium(
        payload, discid=discid, audio_count=audio_count
    )
    tracks = _tracks_from_medium(medium, artist)
    track_count = len(tracks) or _medium_track_count(medium)
    return ReleaseMatch(
        release_mbid=mbid,
        title=title,
        artist=artist,
        year=_year(payload),
        country=str(payload.get("country") or "") or None,
        label=_label(payload),
        track_count=track_count,
        tracks=tracks,
        medium_position=position,
    )


def lookup_discid(
    discid: str,
    *,
    user_agent: str | None,
    http: RateLimitedHttp | None = None,
    audio_count: int | None = None,
) -> list[ReleaseMatch]:
    if not user_agent:
        return []
    client = http or default_http(user_agent)
    url = MB_DISCID_URL.format(discid=quote(discid, safe=""))
    try:
        status, payload = client.get_json(
            url, user_agent=user_agent, max_bytes=ARTIST_IMAGE_MAX_BYTES
        )
    except Exception:
        logger.debug("musicbrainz discid lookup failed", exc_info=True)
        return []
    if status != 200 or not isinstance(payload, dict):
        return []
    matches: list[ReleaseMatch] = []
    for item in payload.get("releases") or []:
        if not isinstance(item, dict):
            continue
        match = release_from_payload(
            item, discid=discid, audio_count=audio_count
        )
        if match is not None:
            matches.append(match)
    return matches


def fetch_release(
    release_mbid: str,
    *,
    user_agent: str | None,
    http: RateLimitedHttp | None = None,
    discid: str | None = None,
    audio_count: int | None = None,
) -> ReleaseMatch | None:
    if not user_agent:
        return None
    client = http or default_http(user_agent)
    url = MB_RELEASE_URL.format(mbid=quote(release_mbid, safe=""))
    try:
        status, payload = client.get_json(
            url, user_agent=user_agent, max_bytes=ARTIST_IMAGE_MAX_BYTES
        )
    except Exception:
        logger.debug("musicbrainz release fetch failed", exc_info=True)
        return None
    if status != 200 or not isinstance(payload, dict):
        return None
    return release_from_payload(
        payload, discid=discid, audio_count=audio_count
    )


def fetch_cover(
    release_mbid: str,
    *,
    user_agent: str | None,
    http: RateLimitedHttp | None = None,
) -> bytes | None:
    if not user_agent:
        return None
    client = http or default_http(user_agent)
    url = CAA_FRONT_URL.format(mbid=quote(release_mbid, safe=""))
    try:
        status, body, ctype = client.get_bytes(
            url, user_agent=user_agent, max_bytes=ARTIST_IMAGE_MAX_BYTES
        )
    except Exception:
        logger.debug("cover art archive fetch failed", exc_info=True)
        return None
    if status != 200 or not body or not looks_like_image(body, ctype):
        return None
    return body
