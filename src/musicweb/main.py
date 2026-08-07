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

from musicweb.cache import CACHE_COVERS, CACHE_STREAMS, ProcessCache
from musicweb.config import Settings, load_settings
from musicweb.cover import CoverCache
from musicweb.library import Library, PathEscapeError
from musicweb.routes import api, pages
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
    cover_cache: CoverCache = app.state.cover_cache

    report = check_dependencies()
    transcoder.configure_encoders(report.aac_encoder)
    settings.validate_library()
    process_cache.start()
    transcoder.start(process_cache.path(CACHE_STREAMS))
    cover_cache.start(process_cache.path(CACHE_COVERS))

    lan = _guess_lan_ip()
    print()
    print("=" * 60)
    print("  Music Library Web Server")
    print(f"  Library : {settings.music_library_path}")
    print(f"  Listening on http://{settings.listen}:{settings.port}")
    if lan and settings.listen in ("0.0.0.0", "::"):
        print(f"  LAN URL : http://{lan}:{settings.port}")
    print(f"  Cache   : {process_cache.root}  ({CACHE_STREAMS}/, {CACHE_COVERS}/)")
    print("  Tools   :")
    for name, ver in report.tools.items():
        print(f"    - {name}: {ver[:72]}")
    print("=" * 60)
    print("  Press Ctrl+C for clean shutdown (temp caches deleted)")
    print("=" * 60)
    print()

    try:
        yield
    finally:
        logger.info("Shutting down — cleaning caches")
        transcoder.shutdown()
        cover_cache.shutdown()
        process_cache.shutdown()
        print("Caches cleaned up. Goodbye.")


# Route-level exceptions mapped to HTTP responses (body: {"detail": str(exc)}).
# PathEscapeError subclasses ValueError; both map to 400.
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
    app = FastAPI(title="Music Library", lifespan=lifespan)
    app.state.settings = settings
    app.state.library = Library(settings.music_library_path)
    app.state.process_cache = ProcessCache()
    app.state.transcoder = Transcoder()
    app.state.cover_cache = CoverCache()

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
    # Rebuild app with these settings so banner matches bind
    application = create_app(settings)
    uvicorn.run(
        application,
        host=settings.listen,
        port=settings.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
