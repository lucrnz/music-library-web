"""FastAPI application entry: lifespan, routes, clean shutdown."""

from __future__ import annotations

import logging
import socket
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from musicweb.config import Settings, load_settings
from musicweb.library import Library
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
    transcoder: Transcoder = app.state.transcoder

    tool_versions = check_dependencies()
    settings.validate_library()
    transcoder.start()

    lan = _guess_lan_ip()
    print()
    print("=" * 60)
    print("  Music Library Web Server")
    print(f"  Library : {settings.music_library_path}")
    print(f"  Listening on http://{settings.listen}:{settings.port}")
    if lan and settings.listen in ("0.0.0.0", "::"):
        print(f"  LAN URL : http://{lan}:{settings.port}")
    print(f"  Cache   : {transcoder.temp_dir}")
    print("  Tools   :")
    for name, ver in tool_versions.items():
        print(f"    - {name}: {ver[:72]}")
    print("=" * 60)
    print("  Press Ctrl+C for clean shutdown (temp cache deleted)")
    print("=" * 60)
    print()

    try:
        yield
    finally:
        logger.info("Shutting down — cleaning transcode cache")
        transcoder.shutdown()
        print("Transcode cache cleaned up. Goodbye.")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Music Library", lifespan=lifespan)
    app.state.settings = settings
    app.state.library = Library(settings.music_library_path)
    app.state.transcoder = Transcoder()

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
