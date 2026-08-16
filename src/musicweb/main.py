"""FastAPI application entry: lifespan, routes, clean shutdown."""

from __future__ import annotations

import asyncio
import logging
import socket
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from musicweb.cache import CACHE_STREAMS, ProcessCache
from musicweb.config import Settings, load_settings
from musicweb.jobs import LibraryJobRunner
from musicweb.library import PathEscapeError
from musicweb.routes import api, pages, pwa
from musicweb.runtime.bootstrap import bootstrap_services
from musicweb.transcode import Transcoder, check_dependencies
from musicweb.transcode.idle import (
    StreamCacheIdle,
    StreamCacheIdleMiddleware,
    idle_sweep_loop,
)
from musicweb.vendor_deps import ensure_vendor_assets

logger = logging.getLogger(__name__)

PACKAGE_DIR = Path(__file__).resolve().parent


def _guess_lan_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    process_cache: ProcessCache = app.state.process_cache
    transcoder: Transcoder = app.state.transcoder
    jobs: LibraryJobRunner = app.state.jobs
    control = getattr(app.state, "control_server", None)
    sweep_task = None
    sweep_stop = asyncio.Event()

    settings.validate_library()
    settings.ensure_data_dir()
    report = check_dependencies()
    # Fail hard before serving if Vue/etc. cannot be fetched or cached.
    vendor_lines = ensure_vendor_assets()
    process_cache.start()
    transcoder.start(process_cache.path(CACHE_STREAMS))
    sweep_task = asyncio.create_task(
        idle_sweep_loop(
            app.state.stream_cache_idle, transcoder.clear_cache, sweep_stop
        ),
        name="stream-cache-idle",
    )

    if control is not None:
        control.start()

    # Non-blocking incremental index on startup
    jobs.start("scan", mode="quick")

    lan = _guess_lan_ip()
    print()
    print("=" * 60)
    print("  Music Library Web Server")
    print(f"  Library : {settings.music_library_path}")
    print(f"  Data    : {settings.musicweb_data_dir}")
    print(f"  Listening on http://{settings.listen}:{settings.port}")
    if lan and settings.listen in ("0.0.0.0", "::"):
        print(f"  LAN URL : http://{lan}:{settings.port}")
    print(settings.public_origin.boot_banner_line())
    print(f"  Streams : {process_cache.path(CACHE_STREAMS)} (temp)")
    print("  Tools   :")
    for name, ver in report.tools.items():
        print(f"    - {name}: {ver[:72]}")
    print("  Frontend:")
    for line in vendor_lines:
        print(f"    - {line}")
    print("=" * 60)
    print("  Press Ctrl+C for clean shutdown (stream cache deleted)")
    print("=" * 60)
    print()

    try:
        yield
    finally:
        logger.info("Shutting down")
        sweep_stop.set()
        if sweep_task is not None:
            await sweep_task
        if control is not None:
            control.stop()
        jobs.shutdown()
        transcoder.shutdown()
        process_cache.shutdown()
        print("Shutdown complete. Goodbye.")


_EXCEPTION_STATUS: list[tuple[type[Exception], int]] = [
    (PathEscapeError, 400),
    (FileNotFoundError, 404),
    (NotADirectoryError, 400),
    (PermissionError, 403),
    (ValueError, 400),
    (RuntimeError, 500),
]


def _make_exception_handler(status_code: int):
    async def handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=status_code, content={"detail": str(exc)}
        )

    return handler


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    rt = bootstrap_services(settings, migrate=True)

    app = FastAPI(title="Music Library", lifespan=lifespan)
    app.state.settings = rt.settings
    app.state.library = rt.library
    app.state.database = rt.database
    app.state.cover_store = rt.cover_store
    app.state.artist_image_store = rt.artist_image_store
    app.state.jobs = rt.jobs
    # Back-compat alias for code still using .scanner
    app.state.scanner = rt.jobs
    app.state.process_cache = ProcessCache()
    app.state.transcoder = Transcoder()
    app.state.stream_cache_idle = StreamCacheIdle()
    app.state.control_server = None  # set by serve after import to avoid cycle

    for exc_type, status_code in _EXCEPTION_STATUS:
        app.add_exception_handler(exc_type, _make_exception_handler(status_code))

    # API + static + PWA before SPA catch-all (pages.router includes /{path}).
    app.include_router(api.router)
    app.mount(
        "/static",
        StaticFiles(directory=str(PACKAGE_DIR / "static")),
        name="static",
    )
    app.include_router(pwa.router)
    app.include_router(pages.router)
    app.add_middleware(
        StreamCacheIdleMiddleware, idle=app.state.stream_cache_idle
    )
    return app


# ASGI app for `uvicorn musicweb.main:app` (lazy: CLI serve builds its own app).
def __getattr__(name: str):
    if name == "app":
        built = create_app()
        globals()["app"] = built
        return built
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
