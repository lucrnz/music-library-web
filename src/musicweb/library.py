"""Filesystem-agnostic library browsing with path jail."""

from __future__ import annotations

import re
from pathlib import Path

from musicweb.scan.formats import is_lossless_audio


class PathEscapeError(ValueError):
    """Raised when a requested path escapes the library root."""


def _natural_key(name: str) -> list:
    """Case-insensitive natural sort key (e.g. track 2 before track 10)."""
    parts = re.split(r"(\d+)", name.lower())
    key: list = []
    for part in parts:
        if part.isdigit():
            key.append(int(part))
        else:
            key.append(part)
    return key


class Library:
    """Browse an arbitrary directory tree under a configured root."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def resolve(self, relative: str | None) -> Path:
        """Resolve a library-relative path and ensure it stays inside the root."""
        rel = (relative or "").strip().replace("\\", "/")
        # Normalize empty / "." to root
        if not rel or rel == ".":
            return self.root

        # Disallow absolute and parent escapes before join
        if rel.startswith("/") or rel.startswith("~"):
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
        """True for indexable/streamable lossless audio files."""
        return is_lossless_audio(path)

    def browse(self, relative: str | None = None) -> dict:
        """
        List one level of children under ``relative`` (empty = library root).

        Returns only directories and known audio files — no assumed layout.
        """
        directory = self.resolve(relative)
        if not directory.exists():
            raise FileNotFoundError(f"Path not found: {relative or '/'}")
        if not directory.is_dir():
            raise NotADirectoryError(f"Not a directory: {relative or '/'}")

        dirs: list[dict] = []
        files: list[dict] = []

        try:
            entries = list(directory.iterdir())
        except PermissionError as exc:
            raise PermissionError(f"Cannot read directory: {relative or '/'}") from exc

        for entry in entries:
            if entry.name.startswith("."):
                continue
            try:
                is_dir = entry.is_dir()
                is_file = entry.is_file()
            except OSError:
                continue

            if is_dir:
                dirs.append(
                    {
                        "name": entry.name,
                        "path": self.relative_to_root(entry),
                    }
                )
            elif is_file and self.is_audio(entry):
                files.append(
                    {
                        "name": entry.name,
                        "path": self.relative_to_root(entry),
                    }
                )

        dirs.sort(key=lambda d: _natural_key(d["name"]))
        files.sort(key=lambda f: _natural_key(f["name"]))

        rel_path = "" if directory == self.root else self.relative_to_root(directory)
        return {"path": rel_path, "dirs": dirs, "files": files}

    def collect_audio(self, relative: str | None = None) -> list[str]:
        """Recursively collect all audio file paths under a directory (or a single file)."""
        target = self.resolve(relative)
        if not target.exists():
            raise FileNotFoundError(f"Path not found: {relative or '/'}")

        if target.is_file():
            if self.is_audio(target):
                return [self.relative_to_root(target)]
            return []

        results: list[str] = []
        for path in target.rglob("*"):
            if path.name.startswith("."):
                continue
            if self.is_audio(path):
                results.append(self.relative_to_root(path))
        results.sort(key=_natural_key)
        return results
