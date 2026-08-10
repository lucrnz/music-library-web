"""Lyrics fetch orchestrator: local file/tags then LRCLIB."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Callable

from sqlalchemy.orm import Session

from musicweb.config import LYRICS_FETCH, LYRICS_RETRY_DAYS, Settings
from musicweb.db.models import Track, TrackLyrics
from musicweb.lyrics.local import read_local_lyrics
from musicweb.lyrics.lrclib import LrclibClient, LrclibQuery
from musicweb.lyrics.parse import strip_remastered_noise
from musicweb.lyrics.types import LyricsResult
from musicweb.timeutil import in_retry_cooldown, utc_now_iso

logger = logging.getLogger(__name__)

__all__ = ["LyricsFetcher", "match_fingerprint", "match_fingerprint_for"]


def match_fingerprint(
    *,
    title: str | None,
    artist_name: str | None,
    album_title: str | None,
    duration_ms: int | None,
) -> str:
    """Stable fingerprint of fields used for remote matching / invalidation."""
    duration = duration_ms if duration_ms is not None else ""
    raw = "|".join(
        [
            strip_remastered_noise(title).lower(),
            (artist_name or "").strip().lower(),
            strip_remastered_noise(album_title).lower(),
            str(duration),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def match_fingerprint_for(track: Track) -> str:
    """Fingerprint from a Track ORM row (uses album relationship when loaded)."""
    album = ""
    if track.album is not None and track.album.title:
        album = track.album.title
    return match_fingerprint(
        title=track.title,
        artist_name=track.artist_name,
        album_title=album,
        duration_ms=track.duration_ms,
    )


def _in_retry_cooldown(row: TrackLyrics) -> bool:
    return in_retry_cooldown(
        status=row.status,
        fetched_at=row.fetched_at,
        retry_days=LYRICS_RETRY_DAYS,
    )


def _sidecar_lrc_exists(abs_path: Path | None) -> bool:
    if abs_path is None:
        return False
    try:
        return abs_path.is_file() and abs_path.with_suffix(".lrc").is_file()
    except OSError:
        return False


class LyricsFetcher:
    """Resolve and persist lyrics for tracks during library scan."""

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        lrclib: LrclibClient | None = None,
    ) -> None:
        self._settings = settings
        self._lrclib = lrclib or LrclibClient()

    def needs_fetch(
        self,
        track: Track,
        row: TrackLyrics | None,
        *,
        force: bool = False,
        abs_path: Path | None = None,
    ) -> bool:
        """
        Whether this track should run through ``fetch_one``.

        *force* (full scan) breaks remote retry cooldown for miss/error rows.
        Stable ``ok`` / ``instrumental`` rows are not re-fetched remotely; a
        present ``.lrc`` sidecar always re-queues so local can win over LRCLIB.
        """
        if row is None:
            return True

        fp = match_fingerprint_for(track)
        if row.match_fingerprint and row.match_fingerprint != fp:
            return True

        # Cheap local re-check: sidecar appeared (or still present) → re-read.
        if _sidecar_lrc_exists(abs_path):
            return True

        if row.status in ("ok", "instrumental"):
            return False

        if row.status == "pending":
            return True

        if row.status == "skipped":
            # Re-attempt when remote is enabled (or full scan) so a prior
            # disabled-fetch pass can fill in.
            return bool(LYRICS_FETCH) or force

        if row.status in ("not_found", "error"):
            if force:
                return True
            if not LYRICS_FETCH:
                return False
            if _in_retry_cooldown(row):
                return False
            return True

        return False

    def fetch_one(
        self,
        session: Session,
        track: Track,
        abs_path: Path | None,
        *,
        cancel: Callable[[], bool] | None = None,
    ) -> LyricsResult:
        if cancel and cancel():
            return LyricsResult(ok=False, status="error", detail="canceled")

        fp = match_fingerprint_for(track)
        result = LyricsResult(ok=False, status="not_found")
        existing = session.get(TrackLyrics, track.id)

        if abs_path is not None and abs_path.is_file():
            local = read_local_lyrics(abs_path)
            if local is not None:
                result = LyricsResult(
                    ok=True,
                    status="ok",
                    source=local.source,
                    is_synced=local.is_synced,
                    plain_text=local.plain_text,
                    synced_lrc=local.synced_lrc,
                )
                self._persist(session, track, result, match_fingerprint=fp)
                return result

        if cancel and cancel():
            return LyricsResult(ok=False, status="error", detail="canceled")

        # Stable remote/local hit: do not re-hit LRCLIB when fingerprint matches.
        if (
            existing is not None
            and existing.status in ("ok", "instrumental")
            and existing.match_fingerprint == fp
        ):
            return LyricsResult(
                ok=existing.status == "ok" or existing.status == "instrumental",
                status=existing.status,
                source=existing.source,
                is_synced=bool(existing.is_synced),
                plain_text=existing.plain_text,
                synced_lrc=existing.synced_lrc,
                provider_id=existing.provider_id,
            )

        if not LYRICS_FETCH:
            result = LyricsResult(
                ok=False, status="skipped", detail="lyrics_fetch_disabled"
            )
            self._persist(session, track, result, match_fingerprint=fp)
            return result

        duration_s = None
        if track.duration_ms is not None and track.duration_ms > 0:
            duration_s = max(1, int(round(track.duration_ms / 1000.0)))

        album_name = ""
        if track.album is not None:
            album_name = track.album.title or ""

        query = LrclibQuery(
            track_name=strip_remastered_noise(track.title),
            artist_name=track.artist_name or "",
            album_name=strip_remastered_noise(album_name) or None,
            duration_s=duration_s,
        )
        result = self._lrclib.get(query)
        # Do not clobber a previous good row when the network fails mid re-fetch.
        if result.status == "error":
            if existing is not None and existing.status in ("ok", "instrumental"):
                existing.fetched_at = utc_now_iso()
                existing.error_message = result.detail
                return result
        self._persist(session, track, result, match_fingerprint=fp)
        return result

    def _persist(
        self,
        session: Session,
        track: Track,
        result: LyricsResult,
        *,
        match_fingerprint: str,
    ) -> TrackLyrics:
        row = session.get(TrackLyrics, track.id)
        if row is None:
            row = TrackLyrics(track_id=track.id)
            session.add(row)

        row.status = result.status
        row.source = result.source
        row.is_synced = bool(result.is_synced and result.synced_lrc)
        row.plain_text = result.plain_text
        row.synced_lrc = result.synced_lrc if row.is_synced else None
        row.provider_id = result.provider_id
        row.match_fingerprint = match_fingerprint
        row.fetched_at = utc_now_iso()
        row.error_message = (result.detail or None) if result.status == "error" else None

        if result.status == "instrumental":
            row.plain_text = None
            row.synced_lrc = None
            row.is_synced = False

        return row
