"""Shared types for artist image fetch cascade."""

from __future__ import annotations

from dataclasses import dataclass, field

from musicweb.config import Settings
from musicweb.db.models import Artist
from musicweb.http_client import RateLimitedHttp


@dataclass
class FetchResult:
    ok: bool
    source: str | None = None  # local | musicbrainz | lastfm | fanarttv
    status: str = "not_found"  # ok | not_found | error | skipped
    mbid: str | None = None
    detail: str | None = None


@dataclass
class ProviderResult:
    """Outcome of one provider attempt (before or without disk persist)."""

    status: str = "not_found"  # ok | not_found | error
    mbid: str | None = None
    image_url: str | None = None
    image_bytes: bytes | None = None
    detail: str | None = None

    @property
    def has_image(self) -> bool:
        return bool(self.image_bytes) or bool(self.image_url)


@dataclass
class FetchContext:
    """Mutable per-artist cascade state shared with providers."""

    artist: Artist
    settings: Settings
    http: RateLimitedHttp
    max_bytes: int
    mbid: str | None = None
    mb_user_agent: str | None = None
    # MusicBrainz rate limits should not force terminal status=error.
    soft_rate_limits: set[str] = field(default_factory=lambda: {"musicbrainz"})
