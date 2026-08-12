"""Start the HTTP server (exclusive data-dir lock for process life)."""

from __future__ import annotations

import logging
import sys

import uvicorn

from musicweb.config import load_settings
from musicweb.control.server import ControlServer
from musicweb.main import create_app
from musicweb.runtime.lock import DataDirLock, DataDirLockError

logger = logging.getLogger(__name__)


def run_serve() -> None:
    settings = load_settings()
    settings.ensure_data_dir()
    lock = DataDirLock(settings.musicweb_data_dir)
    try:
        lock.acquire()
    except DataDirLockError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc

    try:
        app = create_app(settings)
        control = ControlServer(
            settings.musicweb_data_dir,
            jobs=app.state.jobs,
        )
        app.state.control_server = control
        uvicorn.run(
            app,
            host=settings.listen,
            port=settings.port,
            log_level="info",
        )
    finally:
        lock.release()


def serve() -> None:
    """Start the Music Library web server."""
    run_serve()
