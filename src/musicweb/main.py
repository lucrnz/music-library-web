"""FastAPI application entry: lifespan, routes, clean shutdown."""

from __future__ import annotations

import logging
import socket
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from musicweb.artist_image import ArtistImageStore
from musicweb.cache import CACHE_STREAMS, ProcessCache
from musicweb.config import Settings, load_settings
from musicweb.cover import CoverStore
from musicweb.db.engine import init_database
from musicweb.library import Library, PathEscapeError
from musicweb.routes import api, pages
from musicweb.scan.scanner import LibraryScanner
from musicweb.transcode import Transcoder, check_dependencies

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
    scanner: LibraryScanner = app.state.scanner

    settings.validate_library()
    settings.ensure_data_dir()
    report = check_dependencies()
    process_cache.start()
    transcoder.start(process_cache.path(CACHE_STREAMS))

    # Non-blocking incremental index on startup
    scanner.start("quick")

    lan = _guess_lan_ip()
    print()
    print("=" * 60)
    print("  Music Library Web Server")
    print(f"  Library : {settings.music_library_path}")
    print(f"  Data    : {settings.musicweb_data_dir}")
    print(f"  Listening on http://{settings.listen}:{settings.port}")
    if lan and settings.listen in ("0.0.0.0", "::"):
        print(f"  LAN URL : http://{lan}:{settings.port}")
    print(f"  Streams : {process_cache.path(CACHE_STREAMS)} (temp)")
    print("  Tools   :")
    for name, ver in report.tools.items():
        print(f"    - {name}: {ver[:72]}")
    print("=" * 60)
    print("  Press Ctrl+C for clean shutdown (stream cache deleted)")
    print("=" * 60)
    print()

    try:
        yield
    finally:
        logger.info("Shutting down")
        scanner.shutdown()
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
    settings.ensure_data_dir()
    database = init_database(settings.musicweb_data_dir)
    library = Library(settings.music_library_path)
    cover_store = CoverStore(settings.musicweb_data_dir)
    artist_image_store = ArtistImageStore(settings.musicweb_data_dir)
    scanner = LibraryScanner(
        database, library, cover_store, artist_image_store, settings
    )

    app = FastAPI(title="Music Library", lifespan=lifespan)
    app.state.settings = settings
    app.state.library = library
    app.state.database = database
    app.state.cover_store = cover_store
    app.state.artist_image_store = artist_image_store
    app.state.scanner = scanner
    app.state.process_cache = ProcessCache()
    app.state.transcoder = Transcoder()

    for exc_type, status_code in _EXCEPTION_STATUS:
        app.add_exception_handler(exc_type, _make_exception_handler(status_code))

    app.include_router(pages.router)
    app.include_router(api.router)
    app.mount(
        "/static",
        StaticFiles(directory=str(PACKAGE_DIR / "static")),
        name="static",
    )
    return app


# ASGI app for `uvicorn musicweb.main:app`
app = create_app()


def main() -> None:
    """CLI entry point used by `uv run musicweb` / `python -m musicweb`."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    settings = load_settings()
    application = create_app(settings)
    uvicorn.run(
        application,
        host=settings.listen,
        port=settings.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
