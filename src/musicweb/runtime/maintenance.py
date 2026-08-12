"""Local exclusive maintenance context (flock + bootstrap). No RPC."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from musicweb.config import Settings, load_settings
from musicweb.runtime.bootstrap import RuntimeServices, bootstrap_services
from musicweb.runtime.lock import DataDirLock, DataDirLockError


@contextmanager
def exclusive_maintenance(
    settings: Settings | None = None,
) -> Iterator[RuntimeServices]:
    """
    Acquire data-dir exclusive lock and bootstrap for local write jobs.

    Phase 2 remote path uses ``run_library_job`` instead (health → UDS).
    """
    settings = settings or load_settings()
    settings.ensure_data_dir()
    lock = DataDirLock(settings.musicweb_data_dir)
    try:
        lock.acquire()
    except DataDirLockError:
        raise
    rt: RuntimeServices | None = None
    try:
        # We hold the lock → no other server; migrate is safe.
        rt = bootstrap_services(settings, migrate=True)
        yield rt
    finally:
        if rt is not None:
            rt.close()
        lock.release()
