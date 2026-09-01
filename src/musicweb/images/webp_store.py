"""Disk-backed full+thumb WebP asset store under a single root directory."""

from __future__ import annotations

import logging
import threading
from pathlib import Path

from musicweb.images.render import full_thumb_webp_pair

logger = logging.getLogger(__name__)


class WebpAssetStore:
    """Persisted ``{id}.{full|thumb}.webp`` files under ``root``."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _lock_for(self, asset_id: str) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(asset_id)
            if lock is None:
                lock = threading.Lock()
                self._locks[asset_id] = lock
            return lock

    def path_for(self, asset_id: str, size: str) -> Path:
        if size not in ("full", "thumb"):
            raise ValueError(f"Invalid asset size: {size}")
        return self.root / f"{asset_id}.{size}.webp"

    def has(self, asset_id: str) -> bool:
        full = self.path_for(asset_id, "full")
        thumb = self.path_for(asset_id, "thumb")
        try:
            return (
                full.is_file()
                and full.stat().st_size > 0
                and thumb.is_file()
                and thumb.stat().st_size > 0
            )
        except OSError:
            return False

    def get_path(self, asset_id: str, size: str) -> Path | None:
        path = self.path_for(asset_id, size)
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

    def delete(self, asset_id: str) -> None:
        for size in ("full", "thumb"):
            path = self.path_for(asset_id, size)
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass

    def rekey(self, old_id: str, new_id: str) -> None:
        """Rename full+thumb to *new_id*, or drop *old_id* if *new_id* already has files."""
        if old_id == new_id:
            return
        if self.has(new_id):
            self.delete(old_id)
            return
        for size in ("full", "thumb"):
            src = self.path_for(old_id, size)
            dest = self.path_for(new_id, size)
            try:
                if src.is_file() and src.stat().st_size > 0:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    src.replace(dest)
            except OSError as exc:
                logger.debug("webp store rekey failed %s → %s: %s", old_id, new_id, exc)
        self.delete(old_id)

    def write_from_bytes(self, asset_id: str, source: bytes) -> bool:
        """Write full+thumb WebP from raw image bytes. Returns True on success."""
        if not source:
            return False

        lock = self._lock_for(asset_id)
        with lock:
            pair = full_thumb_webp_pair(source)
            if pair is None:
                return False
            full, thumb = pair
            try:
                self._atomic_write(self.path_for(asset_id, "full"), full)
                self._atomic_write(self.path_for(asset_id, "thumb"), thumb)
            except OSError as exc:
                logger.debug("webp store write failed for %s: %s", asset_id, exc)
                return False
            return True
