"""Application configuration loaded from environment / .env."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# WebServer/ (parent of src/)
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_ENV_CANDIDATES = (
    Path.cwd() / ".env",
    _PROJECT_ROOT / ".env",
)

# Hosts treated as secure context over plain HTTP (browser rules).
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

# Artist image fetch tuning (source constants — not env).
ARTIST_IMAGE_FETCH = True
ARTIST_IMAGE_MIN_INTERVAL_MS = 1000
ARTIST_IMAGE_RETRY_DAYS = 14
ARTIST_IMAGE_MAX_BYTES = 8 * 1024 * 1024
MUSICBRAINZ_UA_TEMPLATE = (
    "MusicLibaryWeb/0.1 - https://github.com/lucrnz/music-library-web - Contact: {email}"
)

# Lyrics fetch tuning (source constants — not env). LRCLIB needs no API key.
LYRICS_FETCH = True
LYRICS_MIN_INTERVAL_MS = 250
LYRICS_RETRY_DAYS = 14
LYRICS_MAX_BODY_BYTES = 512 * 1024
LRCLIB_BASE_URL = "https://lrclib.net"
LRCLIB_USER_AGENT = (
    "musicweb/0.1.0 (https://github.com/lucrnz/music-library-web)"
)

# Diagnostic JSONL store (source constant — not env).
DIAG_DIR_MAX_BYTES = 64 * 1024 * 1024

# Household radio picker (source constants — not env).
RADIO_BATCH_SIZE = 8
RADIO_MIN_DURATION_MS = 30000
RADIO_BANLIST_MAX_BATCHES = 4
RADIO_MAX_PER_ARTIST = 2
RADIO_PICK_ATTEMPTS = 32
RADIO_TICK_SECONDS = 1


def _env_file() -> str | None:
    for candidate in _ENV_CANDIDATES:
        if candidate.is_file():
            return str(candidate)
    return None


def load_env_file(*, override: bool = False) -> Path | None:
    """Load the first found project ``.env`` into ``os.environ``.

    Looks at cwd then project root (same candidates as Settings). Existing
    process env wins unless *override* is True. Returns the path loaded, or
    None when no file was found.
    """
    from dotenv import load_dotenv

    path = _env_file()
    if not path:
        return None
    load_dotenv(path, override=override)
    return Path(path)


@dataclass(frozen=True, slots=True)
class PublicOrigin:
    """Parsed MUSICWEB_PUBLIC_ORIGIN for manifest, shell config, and boot banner."""

    raw: str
    """Configured string after strip (may be empty or invalid)."""

    origin: str | None
    """Normalized scheme://host[:port], or None if unset/unparseable."""

    secure: bool
    """True when *origin* is a browser secure-context shape."""

    @staticmethod
    def parse(value: object) -> PublicOrigin:
        if value is None:
            return PublicOrigin(raw="", origin=None, secure=False)
        raw = str(value).strip()
        if not raw:
            return PublicOrigin(raw="", origin=None, secure=False)
        origin = _normalize_origin(raw)
        if origin is None:
            return PublicOrigin(raw=raw, origin=None, secure=False)
        return PublicOrigin(
            raw=raw,
            origin=origin,
            secure=is_secure_context_origin(origin),
        )

    def boot_banner_line(self) -> str:
        """One startup log line describing public origin / PWA install readiness."""
        if self.origin and self.secure:
            return f"  Public  : {self.origin}  (PWA install origin — secure context)"
        if self.raw:
            shown = self.origin or self.raw
            return (
                f"  Public  : {shown}  "
                "(WARNING: not a secure context — PWA install will not work; "
                "use https://… or http://localhost / 127.0.0.1)"
            )
        return (
            "  Public  : (unset)  — set MUSICWEB_PUBLIC_ORIGIN for install URL; "
            "open via https or localhost for PWA"
        )


def _normalize_origin(raw: str) -> str | None:
    """Return scheme://host[:port] or None if not a usable absolute origin."""
    parsed = urlparse(raw.strip())
    if not parsed.scheme or not parsed.netloc:
        return None
    host = parsed.hostname or ""
    if not host:
        return None
    if ":" in host and not host.startswith("["):
        netloc = f"[{host}]"
    else:
        netloc = host
    if parsed.port is not None:
        if not (
            (parsed.scheme == "http" and parsed.port == 80)
            or (parsed.scheme == "https" and parsed.port == 443)
        ):
            netloc = f"{netloc}:{parsed.port}"
    return f"{parsed.scheme.lower()}://{netloc}"


def is_secure_context_origin(origin: str) -> bool:
    """Whether *origin* is a browser secure context (https or loopback http)."""
    parsed = urlparse(origin)
    scheme = (parsed.scheme or "").lower()
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    if scheme == "https":
        return True
    if scheme != "http":
        return False
    if host in _LOOPBACK_HOSTS or host.endswith(".localhost"):
        return True
    return False


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    music_library_path: Path = Field(
        default=Path("../Library"),
        description="Root directory of the music library (filesystem-agnostic).",
    )
    musicweb_data_dir: Path = Field(
        default=Path("data"),
        description=(
            "Directory for library.db and persisted covers/ "
            "(not a single SQLite file path)."
        ),
    )
    listen: str = Field(default="0.0.0.0", description="Bind address")
    port: int = Field(default=8765, ge=1, le=65535, description="Listen port")

    # Canonical browser origin for PWA install (optional). Not the bind address.
    # Keep as str so env loading does not JSON-decode; use .public_origin for the
    # structured PublicOrigin result.
    musicweb_public_origin: str = Field(
        default="",
        description=(
            "Canonical URL clients should open for install (secure context: "
            "https or http://localhost / 127.0.0.1). Empty = relative manifest."
        ),
    )

    # Secrets / personal contact for artist image providers (optional).
    lastfm_api_key: str = Field(default="", description="Last.fm API key (read-only).")
    fanart_tv_api_key: str = Field(default="", description="fanart.tv personal API key.")
    musicbrainz_contact_email: str = Field(
        default="",
        description="Contact email embedded in the MusicBrainz User-Agent.",
    )
    index_lossy: bool = Field(
        default=False,
        validation_alias=AliasChoices("MUSICWEB_INDEX_LOSSY", "index_lossy"),
        description=(
            "When true, the scanner may index MP3/AAC as marked lossy sources. "
            "Default off."
        ),
    )

    @field_validator("music_library_path", "musicweb_data_dir", mode="before")
    @classmethod
    def expand_path(cls, value: object) -> Path:
        path = Path(str(value)).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        else:
            path = path.resolve()
        return path

    @field_validator(
        "lastfm_api_key",
        "fanart_tv_api_key",
        "musicbrainz_contact_email",
        "musicweb_public_origin",
        mode="before",
    )
    @classmethod
    def strip_secret(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @property
    def public_origin(self) -> PublicOrigin:
        """Parsed public origin (raw / origin / secure) for PWA and boot banner."""
        return PublicOrigin.parse(self.musicweb_public_origin)

    @property
    def diag_dir(self) -> Path:
        """Durable JSONL event directory under the data dir."""
        return self.musicweb_data_dir / "diag"

    def musicbrainz_user_agent(self) -> str | None:
        """MusicBrainz UA when contact email is configured; else None."""
        email = self.musicbrainz_contact_email
        if not email:
            return None
        return MUSICBRAINZ_UA_TEMPLATE.format(email=email)

    def validate_library(self) -> None:
        if not self.music_library_path.exists():
            raise FileNotFoundError(
                f"MUSIC_LIBRARY_PATH does not exist: {self.music_library_path}"
            )
        if not self.music_library_path.is_dir():
            raise NotADirectoryError(
                f"MUSIC_LIBRARY_PATH is not a directory: {self.music_library_path}"
            )

    def ensure_data_dir(self) -> Path:
        """Create the data directory (and covers subtree) if needed."""
        self.musicweb_data_dir.mkdir(parents=True, exist_ok=True)
        (self.musicweb_data_dir / "covers" / "albums").mkdir(parents=True, exist_ok=True)
        (self.musicweb_data_dir / "covers" / "artists").mkdir(parents=True, exist_ok=True)
        self.diag_dir.mkdir(parents=True, exist_ok=True)
        return self.musicweb_data_dir


def load_settings() -> Settings:
    return Settings()
