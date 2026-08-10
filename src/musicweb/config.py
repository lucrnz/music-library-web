"""Application configuration loaded from environment / .env."""

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# WebServer/ (parent of src/)
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_ENV_CANDIDATES = (
    Path.cwd() / ".env",
    _PROJECT_ROOT / ".env",
)

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


def _env_file() -> str | None:
    for candidate in _ENV_CANDIDATES:
        if candidate.is_file():
            return str(candidate)
    return None


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

    # Secrets / personal contact for artist image providers (optional).
    lastfm_api_key: str = Field(default="", description="Last.fm API key (read-only).")
    fanart_tv_api_key: str = Field(default="", description="fanart.tv personal API key.")
    musicbrainz_contact_email: str = Field(
        default="",
        description="Contact email embedded in the MusicBrainz User-Agent.",
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
        mode="before",
    )
    @classmethod
    def strip_secret(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value).strip()

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
        return self.musicweb_data_dir


def load_settings() -> Settings:
    return Settings()
