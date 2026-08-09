"""Artist profile image WebP store under the data directory.

Images live at ``$MUSICWEB_DATA_DIR/covers/artists/{artist_id}.{full|thumb}.webp``.
Placeholders are never written to disk and never set ``has_image``.
"""

from __future__ import annotations

import io
import logging
import threading
from pathlib import Path

from PIL import Image, ImageOps

from musicweb.cover import (
    FULL_SIZE,
    FULL_WEBP_QUALITY,
    THUMB_SIZE,
    THUMB_WEBP_QUALITY,
    WEBP_METHOD,
    _flatten_rgb,
    placeholder_webp,
)

logger = logging.getLogger(__name__)

# Re-export for API consumers.
__all__ = ["ArtistImageStore", "placeholder_webp"]


def _render_square_webp(source: bytes, size: int, **save_kwargs) -> bytes | None:
    try:
        with Image.open(io.BytesIO(source)) as img:
            fitted = ImageOps.fit(
                img,
                (size, size),
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5),
            )
            fitted = _flatten_rgb(fitted)
            buf = io.BytesIO()
            fitted.save(buf, format="WEBP", **save_kwargs)
            return buf.getvalue()
    except Exception as exc:
        logger.debug("artist image webp conversion failed: %s", exc)
        return None


class ArtistImageStore:
    """Persisted artist-keyed WebP portraits under the data directory."""

    def __init__(self, data_dir: Path) -> None:
        self.root = data_dir / "covers" / "artists"
        self.root.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _lock_for(self, artist_id: str) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(artist_id)
            if lock is None:
                lock = threading.Lock()
                self._locks[artist_id] = lock
            return lock

    def path_for(self, artist_id: str, size: str) -> Path:
        if size not in ("full", "thumb"):
            raise ValueError(f"Invalid artist image size: {size}")
        return self.root / f"{artist_id}.{size}.webp"

    def has_image(self, artist_id: str) -> bool:
        full = self.path_for(artist_id, "full")
        thumb = self.path_for(artist_id, "thumb")
        try:
            return (
                full.is_file()
                and full.stat().st_size > 0
                and thumb.is_file()
                and thumb.stat().st_size > 0
            )
        except OSError:
            return False

    def image_path(self, artist_id: str, size: str) -> Path | None:
        path = self.path_for(artist_id, size)
        try:
            if path.is_file() and path.stat().st_size > 0:
                return path
        except OSError:
            pass
        return None

    def _atomic_write(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(path.suffix + ".partial")
        partial.write_bytes(data)
        partial.replace(path)

    def delete_artist_image(self, artist_id: str) -> None:
        for size in ("full", "thumb"):
            path = self.path_for(artist_id, size)
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass

    def ensure_from_bytes(self, artist_id: str, source: bytes) -> bool:
        """Write full+thumb WebP from raw image bytes. Returns True on success."""
        if not source:
            return False

        lock = self._lock_for(artist_id)
        with lock:
            full = _render_square_webp(
                source,
                FULL_SIZE,
                lossless=True,
                quality=FULL_WEBP_QUALITY,
                method=WEBP_METHOD,
            )
            thumb = _render_square_webp(
                source,
                THUMB_SIZE,
                quality=THUMB_WEBP_QUALITY,
                method=WEBP_METHOD,
            )
            if full is None or thumb is None:
                return False
            try:
                self._atomic_write(self.path_for(artist_id, "full"), full)
                self._atomic_write(self.path_for(artist_id, "thumb"), thumb)
            except OSError as exc:
                logger.debug("artist image store write failed: %s", exc)
                return False
            return True
