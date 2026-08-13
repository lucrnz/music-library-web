"""Run the loopback exclusive-audio companion (no data-dir lock / DB)."""

from __future__ import annotations

import logging
import os
import shutil
import sys

import typer
import uvicorn

from musicweb.exclusive.app import create_exclusive_app
from musicweb.exclusive.protocol import DEFAULT_PORT, PROTOCOL_VERSION
from musicweb.exclusive.session import ExclusiveHub

logger = logging.getLogger(__name__)


def run_exclusive_audio(
    *,
    port: int = DEFAULT_PORT,
    mpv: str | None = None,
) -> None:
    token = (os.environ.get("HOG_TOKEN") or "").strip()
    if not token:
        print(
            "HOG_TOKEN is required (non-empty).\n"
            "  export HOG_TOKEN='$(openssl rand -hex 16)'\n"
            "  # paste the same value into Mac PWA → Settings → Exclusive audio",
            file=sys.stderr,
        )
        raise SystemExit(1)

    if mpv:
        mpv_path = mpv
        if not os.path.isfile(mpv_path) or not os.access(mpv_path, os.X_OK):
            print(
                f"mpv not executable: {mpv_path}",
                file=sys.stderr,
            )
            raise SystemExit(1)
    else:
        mpv_path = shutil.which("mpv")
        if not mpv_path:
            print(
                "mpv not found on PATH. Install mpv or pass --mpv /path/to/mpv.",
                file=sys.stderr,
            )
            raise SystemExit(1)

    if sys.platform != "darwin":
        print(
            "Warning: exclusive Core Audio hog is macOS-only; "
            "device probe may be limited on this platform.",
            file=sys.stderr,
        )

    hub = ExclusiveHub(hog_token=token, mpv_path=mpv_path)
    app = create_exclusive_app(hub)

    print(
        f"musicweb exclusive-audio  protocol v{PROTOCOL_VERSION}\n"
        f"  listening  ws://127.0.0.1:{port}/ws\n"
        f"  health     http://127.0.0.1:{port}/health\n"
        f"  mpv        {mpv_path}\n"
        f"  HOG_TOKEN  set ({len(token)} chars) — paste the same value into Mac PWA settings\n"
        f"  note       no data-dir lock; not the library server",
        flush=True,
    )

    # Loopback only — never bind 0.0.0.0.
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        ws="websockets",
    )


def exclusive_audio(
    port: int = typer.Option(
        DEFAULT_PORT,
        "--port",
        help=f"Loopback port (default {DEFAULT_PORT})",
    ),
    mpv: str | None = typer.Option(
        None,
        "--mpv",
        help="Path to mpv binary (default: PATH lookup)",
    ),
) -> None:
    """macOS exclusive-audio companion (mpv hog + WebSocket on loopback)."""
    run_exclusive_audio(port=port, mpv=mpv)
