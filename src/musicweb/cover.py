"""Album cover extraction and persisted WebP store under the data directory.

Covers live at ``$MUSICWEB_DATA_DIR/covers/albums/{album_id}.{full|thumb}.webp``
and survive process restarts. Placeholders are never written to disk and never
set ``has_cover``.
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

from musicweb.images import (
    FULL_SIZE,
    FULL_WEBP_QUALITY,
    THUMB_SIZE,
    THUMB_WEBP_QUALITY,
    WEBP_METHOD,
    WebpAssetStore,
    placeholder_webp,
)

logger = logging.getLogger(__name__)

# Re-exports for existing importers.
__all__ = [
    "FULL_SIZE",
    "FULL_WEBP_QUALITY",
    "THUMB_SIZE",
    "THUMB_WEBP_QUALITY",
    "WEBP_METHOD",
    "CoverStore",
    "placeholder_webp",
]

FOLDER_COVER_NAMES = (
    "cover.jpg",
    "cover.jpeg",
    "cover.png",
    "folder.jpg",
    "folder.jpeg",
    "folder.png",
    "Front.jpg",
    "Front.jpeg",
    "Front.png",
    "front.jpg",
    "front.jpeg",
    "front.png",
)


def _folder_cover(directory: Path) -> Path | None:
    for name in FOLDER_COVER_NAMES:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    for pattern in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
        matches = sorted(directory.glob(pattern))
        if matches:
            return matches[0]
    return None


def _extract_embedded(audio_path: Path, dest: Path) -> bool:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(audio_path),
        "-an",
        "-vcodec",
        "copy",
        str(dest),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.debug("ffmpeg cover extract failed: %s", exc)
        return False
    return proc.returncode == 0 and dest.is_file() and dest.stat().st_size > 0


def _cover_source_bytes(audio_path: Path) -> bytes | None:
    """Return raw cover image bytes from embedded art or a folder image."""
    with tempfile.TemporaryDirectory(prefix="musicweb-cover-") as tmp:
        for ext in (".jpg", ".png"):
            dest = Path(tmp) / f"cover{ext}"
            if _extract_embedded(audio_path, dest):
                return dest.read_bytes()

    folder = _folder_cover(audio_path.parent)
    if folder is not None:
        try:
            return folder.read_bytes()
        except OSError:
            pass
    return None


class CoverStore:
    """Persisted album-keyed WebP covers under the data directory."""

    def __init__(self, data_dir: Path) -> None:
        self._store = WebpAssetStore(data_dir / "covers" / "albums")
        # Public root path for callers that inspect the store location.
        self.root = self._store.root

    def path_for(self, album_id: str, size: str) -> Path:
        return self._store.path_for(album_id, size)

    def has_cover(self, album_id: str) -> bool:
        return self._store.has(album_id)

    def cover_path(self, album_id: str, size: str) -> Path | None:
        return self._store.get_path(album_id, size)

    def delete_album_cover(self, album_id: str) -> None:
        self._store.delete(album_id)

    def ensure_album_cover(
        self, album_id: str, audio_path: Path, *, force: bool = False
    ) -> bool:
        """
        Extract real cover art for ``album_id`` from ``audio_path``.

        Writes full+thumb WebP only when real art is found.
        Returns True if files on disk represent real art.
        Returns False when no art source exists (nothing written, or removed on force).
        """
        if not force and self.has_cover(album_id):
            return True

        source = _cover_source_bytes(audio_path)
        if source is None:
            if force:
                self.delete_album_cover(album_id)
            return False

        ok = self._store.write_from_bytes(album_id, source)
        if not ok and force:
            self.delete_album_cover(album_id)
        return ok

    def get_or_fill(
        self, album_id: str, audio_path: Path
    ) -> dict[str, Path | bytes]:
        """Return full/thumb as Path when on disk, else try extract; else in-memory placeholder."""
        if self.has_cover(album_id):
            return {
                "full": self.path_for(album_id, "full"),
                "thumb": self.path_for(album_id, "thumb"),
            }
        self.ensure_album_cover(album_id, audio_path, force=False)
        out: dict[str, Path | bytes] = {}
        for size in ("full", "thumb"):
            path = self.cover_path(album_id, size)
            out[size] = path if path is not None else placeholder_webp(size)
        return out
