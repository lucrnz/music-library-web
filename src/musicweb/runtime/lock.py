"""Exclusive data-dir flock for single local writer (serve or offline CLI)."""

from __future__ import annotations

import fcntl
from pathlib import Path
from types import TracebackType


class DataDirLockError(RuntimeError):
    """Another musicweb process holds the data directory exclusive lock."""


def lock_path(data_dir: Path) -> Path:
    return Path(data_dir) / "musicweb.lock"


def is_data_dir_locked(data_dir: Path) -> bool:
    """
    True if another process holds exclusive flock on the data-dir lock file.

    Probes with LOCK_EX|LOCK_NB and releases immediately if acquired.
    Brief race window is acceptable for migrate/doctor checks only.
    """
    path = lock_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = open(path, "a+", encoding="utf-8")
    try:
        try:
            fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(fd.fileno(), fcntl.LOCK_UN)
        return False
    finally:
        fd.close()


class DataDirLock:
    """Hold an exclusive non-blocking flock for the process lifetime of a write path."""

    def __init__(self, data_dir: Path) -> None:
        self._path = lock_path(data_dir)
        self._fd: object | None = None

    @property
    def path(self) -> Path:
        return self._path

    def acquire(self) -> None:
        if self._fd is not None:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fd = open(self._path, "a+", encoding="utf-8")
        try:
            fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            fd.close()
            raise DataDirLockError(
                f"Another musicweb process holds the data directory lock "
                f"({self._path}). Stop the server (or other writer) first."
            ) from None
        self._fd = fd

    def release(self) -> None:
        fd = self._fd
        if fd is None:
            return
        try:
            fcntl.flock(fd.fileno(), fcntl.LOCK_UN)
        finally:
            fd.close()
            self._fd = None

    def __enter__(self) -> DataDirLock:
        self.acquire()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.release()
