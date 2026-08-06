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
    listen: str = Field(default="0.0.0.0", description="Bind address")
    port: int = Field(default=8765, ge=1, le=65535, description="Listen port")

    @field_validator("music_library_path", mode="before")
    @classmethod
    def expand_path(cls, value: object) -> Path:
        path = Path(str(value)).expanduser()
        if not path.is_absolute():
            # Resolve relative to process cwd (typically WebServer/)
            path = (Path.cwd() / path).resolve()
        else:
            path = path.resolve()
        return path

    def validate_library(self) -> None:
        if not self.music_library_path.exists():
            raise FileNotFoundError(
                f"MUSIC_LIBRARY_PATH does not exist: {self.music_library_path}"
            )
        if not self.music_library_path.is_dir():
            raise NotADirectoryError(
                f"MUSIC_LIBRARY_PATH is not a directory: {self.music_library_path}"
            )


def load_settings() -> Settings:
    return Settings()
