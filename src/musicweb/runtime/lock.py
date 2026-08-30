"""Exclusive data-dir lock for single local writer (serve or offline CLI)."""

from __future__ import annotations

import sys
from pathlib import Path
from types import TracebackType

if sys.platform == "win32":
    import msvcrt
else:
    import fcntl


class DataDirLockError(RuntimeError):
    """Another musicweb process holds the data directory exclusive lock."""


def lock_path(data_dir: Path) -> Path:
    return Path(data_dir) / "musicweb.lock"


def _open_lock_file(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = open(path, "a+b")
    try:
        if path.stat().st_size == 0:
            fd.write(b"\n")
            fd.flush()
        fd.seek(0)
    except Exception:
        fd.close()
        raise
    return fd


def _lock_ex_nb(fd) -> None:
    if sys.platform == "win32":
        msvcrt.locking(fd.fileno(), msvcrt.LK_NBLCK, 1)
        return
    fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)


def _unlock(fd) -> None:
    if sys.platform == "win32":
        fd.seek(0)
        msvcrt.locking(fd.fileno(), msvcrt.LK_UNLCK, 1)
        return
    fcntl.flock(fd.fileno(), fcntl.LOCK_UN)


def is_data_dir_locked(data_dir: Path) -> bool:
    """
    True if another process holds the exclusive data-dir lock.

    Probes with a non-blocking exclusive lock and releases immediately if
    acquired. Brief race window is acceptable for migrate/doctor checks only.
    """
    path = lock_path(data_dir)
    fd = _open_lock_file(path)
    try:
        try:
            _lock_ex_nb(fd)
        except (BlockingIOError, OSError):
            return True
        _unlock(fd)
        return False
    finally:
        fd.close()


class DataDirLock:
    """Hold an exclusive non-blocking lock for the process lifetime of a write path."""

    def __init__(self, data_dir: Path) -> None:
        self._path = lock_path(data_dir)
        self._fd: object | None = None

    @property
    def path(self) -> Path:
        return self._path

    def acquire(self) -> None:
        if self._fd is not None:
            return
        fd = _open_lock_file(self._path)
        try:
            _lock_ex_nb(fd)
        except (BlockingIOError, OSError):
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
            _unlock(fd)
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
