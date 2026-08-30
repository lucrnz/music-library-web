"""Library path jail and present-audio checks."""

from __future__ import annotations

import re
from pathlib import Path

from musicweb.scan.formats import is_indexable_audio

_DRIVE_ABS = re.compile(r"^[A-Za-z]:")


class PathEscapeError(ValueError):
    """Raised when a requested path escapes the library root."""


class Library:
    """Jail library-relative paths and present indexable audio under a root."""

    def __init__(self, root: Path, *, index_lossy: bool = False) -> None:
        self.root = root.resolve()
        self.index_lossy = bool(index_lossy)

    def resolve(self, relative: str | None) -> Path:
        """Resolve a library-relative path and ensure it stays inside the root."""
        rel = (relative or "").strip().replace("\\", "/")
        # Normalize empty / "." to root
        if not rel or rel == ".":
            return self.root

        # Disallow absolute, UNC, drive-letter, and parent escapes before join
        if (
            rel.startswith("/")
            or rel.startswith("~")
            or rel.startswith("//")
            or _DRIVE_ABS.match(rel)
            or Path(rel).is_absolute()
        ):
            raise PathEscapeError("Absolute paths are not allowed")

        candidate = (self.root / rel).resolve()
        try:
            candidate.relative_to(self.root)
        except ValueError as exc:
            raise PathEscapeError("Path escapes library root") from exc
        return candidate

    def relative_to_root(self, path: Path) -> str:
        return path.resolve().relative_to(self.root).as_posix()

    def is_audio(self, path: Path) -> bool:
        """True for indexable audio (lossless, plus MP3/AAC when opted in)."""
        return is_indexable_audio(path, index_lossy=self.index_lossy)

    def present_audio(self, rel: str | None) -> Path | None:
        """Jail + exists + indexable audio. ``None`` on miss, escape, or non-audio."""
        if not (rel or "").strip():
            return None
        try:
            path = self.resolve(rel)
        except (PathEscapeError, OSError):
            return None
        if not path.is_file() or not self.is_audio(path):
            return None
        return path
