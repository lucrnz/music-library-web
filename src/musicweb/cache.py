"""Process-scoped cache root for transcoded streams (wiped on shutdown).

Layout::

    /tmp/musicweb-<random>/
      streams/   # transcoded audio (owned by Transcoder)

Cover art is persisted under MUSICWEB_DATA_DIR (see CoverStore), not here.
TempKVCache remains available for stream-related or generic byte caches.
"""

from __future__ import annotations

import hashlib
import logging
import shutil
import tempfile
import threading
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger(__name__)

# Named subdirectories under the process cache root.
CACHE_STREAMS = "streams"
CACHE_SUBDIRS = (CACHE_STREAMS,)


class ProcessCache:
    """One musicweb-* temp root with named subdirectories; wiped on shutdown."""

    def __init__(self) -> None:
        self._root: Path | None = None

    @property
    def root(self) -> Path:
        if self._root is None:
            raise RuntimeError("Process cache not started")
        return self._root

    def path(self, name: str) -> Path:
        """Return ``root / name`` (must already exist after start)."""
        return self.root / name

    def start(self) -> Path:
        """Create the temp root and standard subdirs (idempotent)."""
        if self._root is None:
            self._root = Path(tempfile.mkdtemp(prefix="musicweb-"))
            for name in CACHE_SUBDIRS:
                (self._root / name).mkdir(exist_ok=True)
            logger.info("Process cache root: %s", self._root)
        return self._root

    def shutdown(self) -> None:
        """Remove the entire process cache tree."""
        if self._root is not None and self._root.exists():
            logger.info("Cleaning up process cache: %s", self._root)
            shutil.rmtree(self._root, ignore_errors=True)
        self._root = None


class TempKVCache:
    """Byte-blob key-value cache as files in a provided directory.

    The ``name`` is used only in log lines. The directory is supplied by
    ProcessCache (e.g. ``process_cache.path("covers")``); this class does not
    own the process root and does not delete the directory on shutdown.
    Writes are atomic (``.partial`` + rename); readers never see a partial
    value.
    """

    def __init__(self, name: str) -> None:
        self._name = name
        self._temp_dir: Path | None = None
        # Per-key fill locks, created on demand under _locks_guard.
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    @property
    def temp_dir(self) -> Path:
        if self._temp_dir is None:
            raise RuntimeError(f"Cache {self._name!r} not started")
        return self._temp_dir

    def start(self, cache_dir: Path) -> Path:
        """Use an existing directory (idempotent); call once at app startup."""
        if self._temp_dir is None:
            cache_dir.mkdir(parents=True, exist_ok=True)
            self._temp_dir = cache_dir
            logger.info("%s cache directory: %s", self._name, self._temp_dir)
        return self._temp_dir

    def shutdown(self) -> None:
        """Release state. Disk is owned by ProcessCache (wiped on its shutdown)."""
        with self._locks_guard:
            self._locks.clear()
        self._temp_dir = None

    def clear(self) -> int:
        """Delete every entry under this cache dir. Returns count removed.

        Does not remove the directory itself. Also clears per-key locks so
        wiped keys can refill cleanly.
        """
        if self._temp_dir is None:
            raise RuntimeError(f"Cache {self._name!r} not started")

        removed = 0
        for child in self.temp_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                try:
                    child.unlink()
                except OSError:
                    continue
            removed += 1

        with self._locks_guard:
            self._locks.clear()

        logger.info(
            "Cleared %s cache: %s (%d entries)",
            self._name,
            self.temp_dir,
            removed,
        )
        return removed

    @staticmethod
    def digest(*parts: str) -> str:
        """Stable sha256 key from arbitrary string parts (e.g. tag values)."""
        return hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()

    def _path(self, key: str) -> Path:
        return self.temp_dir / key

    def get(self, key: str) -> bytes | None:
        """Return the cached value, or None on a miss/IO error."""
        try:
            data = self._path(key).read_bytes()
        except OSError:
            return None
        return data or None

    def set(self, key: str, value: bytes) -> None:
        """Store a value atomically (.partial write + rename)."""
        path = self._path(key)
        partial = path.with_name(f"{path.name}.partial")
        partial.write_bytes(value)
        partial.replace(path)

    def _lock_for(self, key: str) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = threading.Lock()
                self._locks[key] = lock
            return lock

    def _release_lock(self, key: str, lock: threading.Lock) -> None:
        with self._locks_guard:
            if self._locks.get(key) is lock:
                del self._locks[key]

    def get_or_set(self, key: str, factory: Callable[[], bytes]) -> bytes:
        """Return the cached value, filling it via ``factory`` on a miss.

        Concurrent callers for the same key run the factory once; waiters
        serve the stored value.
        """
        cached = self.get(key)
        if cached is not None:
            return cached

        lock = self._lock_for(key)
        with lock:
            try:
                cached = self.get(key)
                if cached is not None:
                    return cached
                value = factory()
                try:
                    self.set(key, value)
                except OSError as exc:
                    logger.debug(
                        "%s cache write failed for %s: %s",
                        self._name,
                        key,
                        exc,
                    )
                return value
            finally:
                self._release_lock(key, lock)
