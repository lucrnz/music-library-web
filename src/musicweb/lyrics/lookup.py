"""Session-only remote lyrics lookup. No Session, no TrackLyrics write."""

from __future__ import annotations

from musicweb.config import LYRICS_FETCH
from musicweb.lyrics.fetch import match_fingerprint
from musicweb.lyrics.lrclib import LrclibClient, LrclibQuery
from musicweb.lyrics.types import LyricsResult

_cache: dict[str, LyricsResult] = {}


def lookup_remote_lyrics(
    title: str | None,
    artist: str | None,
    album: str | None,
    duration_ms: int | None,
    *,
    client: LrclibClient | None = None,
) -> LyricsResult:
    """LRCLIB by title/artist/album/duration. In-process fingerprint cache only."""
    if not LYRICS_FETCH:
        return LyricsResult(ok=False, status="skipped", source="lrclib")
    title_s = (title or "").strip()
    artist_s = (artist or "").strip()
    album_s = (album or "").strip() or None
    if not title_s or not artist_s:
        return LyricsResult(ok=False, status="not_found", source="lrclib")
    fp = match_fingerprint(
        title=title_s,
        artist_name=artist_s,
        album_title=album_s,
        duration_ms=duration_ms,
    )
    hit = _cache.get(fp)
    if hit is not None:
        return hit
    duration_s: int | None = None
    if duration_ms is not None and duration_ms > 0:
        duration_s = max(1, int(round(duration_ms / 1000)))
    lrclib = client or LrclibClient()
    result = lrclib.get(
        LrclibQuery(
            track_name=title_s,
            artist_name=artist_s,
            album_name=album_s,
            duration_s=duration_s,
        )
    )
    if result.status in {"ok", "instrumental", "not_found"}:
        _cache[fp] = result
    return result


def lyrics_result_dict(track_id: str | None, result: LyricsResult) -> dict:
    instrumental = result.status == "instrumental"
    return {
        "track_id": track_id,
        "status": result.status,
        "source": result.source,
        "is_synced": bool(result.is_synced and result.synced_lrc and not instrumental),
        "plain_text": None if instrumental else result.plain_text,
        "synced_lrc": None if instrumental else result.synced_lrc,
        "instrumental": instrumental,
    }
