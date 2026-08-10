"""LRCLIB HTTP client (https://lrclib.net)."""

from __future__ import annotations

import logging
import time
import urllib.parse
from dataclasses import dataclass

from musicweb.config import (
    LRCLIB_BASE_URL,
    LRCLIB_USER_AGENT,
    LYRICS_MAX_BODY_BYTES,
    LYRICS_MIN_INTERVAL_MS,
)
from musicweb.http_client import RateLimitedHttp
from musicweb.lyrics.parse import looks_like_lrc, normalize_lyrics_text, plain_from_lrc
from musicweb.lyrics.types import LyricsResult

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LrclibQuery:
    track_name: str
    artist_name: str
    album_name: str | None
    duration_s: int | None


class LrclibClient:
    """Fetch lyrics from LRCLIB with polite rate limiting."""

    def __init__(
        self,
        http: RateLimitedHttp | None = None,
        *,
        base_url: str = LRCLIB_BASE_URL,
        user_agent: str = LRCLIB_USER_AGENT,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._ua = user_agent
        self._http = http or RateLimitedHttp(LYRICS_MIN_INTERVAL_MS, user_agent)

    def get(self, query: LrclibQuery) -> LyricsResult:
        if not query.track_name.strip() or not query.artist_name.strip():
            return LyricsResult(
                ok=False, status="not_found", detail="missing_title_or_artist"
            )

        params: dict[str, str] = {
            "track_name": query.track_name,
            "artist_name": query.artist_name,
        }
        if query.album_name:
            params["album_name"] = query.album_name
        if query.duration_s is not None and 1 <= query.duration_s <= 3600:
            params["duration"] = str(query.duration_s)

        url = f"{self._base}/api/get?{urllib.parse.urlencode(params)}"
        return self._request(url, retry_on_429=True)

    def _request(self, url: str, *, retry_on_429: bool) -> LyricsResult:
        try:
            status, payload = self._http.get_json(
                url,
                user_agent=self._ua,
                max_bytes=LYRICS_MAX_BODY_BYTES,
            )
        except Exception as exc:
            logger.debug("lrclib request failed: %s", exc)
            return LyricsResult(
                ok=False, status="error", source="lrclib", detail=str(exc)[:200]
            )

        if status == 429:
            if retry_on_429:
                time.sleep(5.0)
                return self._request(url, retry_on_429=False)
            return LyricsResult(
                ok=False, status="error", source="lrclib", detail="rate_limited"
            )

        if status == 404:
            return LyricsResult(ok=False, status="not_found", source="lrclib")

        if status != 200 or not isinstance(payload, dict):
            return LyricsResult(
                ok=False,
                status="error",
                source="lrclib",
                detail=f"http_{status}",
            )

        return map_lrclib_payload(payload)


def map_lrclib_payload(payload: dict) -> LyricsResult:
    """Map LRCLIB JSON body to LyricsResult (pure; testable)."""
    provider_id = payload.get("id")
    provider_id_s = str(provider_id) if provider_id is not None else None

    if payload.get("instrumental") is True:
        return LyricsResult(
            ok=True,
            status="instrumental",
            source="lrclib",
            provider_id=provider_id_s,
        )

    synced = normalize_lyrics_text(payload.get("syncedLyrics"))
    plain = normalize_lyrics_text(payload.get("plainLyrics"))

    if synced and looks_like_lrc(synced):
        if not plain:
            plain = plain_from_lrc(synced) or None
        return LyricsResult(
            ok=True,
            status="ok",
            source="lrclib",
            is_synced=True,
            plain_text=plain,
            synced_lrc=synced,
            provider_id=provider_id_s,
        )

    if plain:
        # Some records put LRC only in plainLyrics
        if looks_like_lrc(plain):
            return LyricsResult(
                ok=True,
                status="ok",
                source="lrclib",
                is_synced=True,
                plain_text=plain_from_lrc(plain) or None,
                synced_lrc=plain,
                provider_id=provider_id_s,
            )
        return LyricsResult(
            ok=True,
            status="ok",
            source="lrclib",
            is_synced=False,
            plain_text=plain,
            synced_lrc=None,
            provider_id=provider_id_s,
        )

    return LyricsResult(
        ok=False,
        status="not_found",
        source="lrclib",
        provider_id=provider_id_s,
        detail="empty_body",
    )
