"""Run the loopback Desktop companion (no data-dir lock / DB)."""

from __future__ import annotations

import logging
import os
import shutil
import sys
from pathlib import Path

import typer
import uvicorn

from musicweb.config import load_env_file
from musicweb.exclusive.app import create_exclusive_app
from musicweb.exclusive.paths import companion_data_dir
from musicweb.exclusive.protocol import DEFAULT_PORT, PROTOCOL_VERSION
from musicweb.exclusive.session import ExclusiveHub

logger = logging.getLogger(__name__)


def banner_lines(port: int, mpv_path: str, data_dir: Path) -> str:
    return (
        f"musicweb companion  protocol v{PROTOCOL_VERSION}\n"
        f"  listening  ws://127.0.0.1:{port}/ws\n"
        f"  health     http://127.0.0.1:{port}/health\n"
        f"  files      {data_dir}\n"
        f"  mpv        {mpv_path}\n"
        f"  COMPANION_TOKEN  set — paste the same value into PWA settings\n"
        f"  note       no data-dir lock; not the library server"
    )


def run_companion(
    *,
    port: int = DEFAULT_PORT,
    mpv: str | None = None,
) -> None:
    # Same .env discovery as the library server (cwd, then project root).
    # Does not take data-dir lock or open the DB.
    load_env_file()

    token = (os.environ.get("COMPANION_TOKEN") or "").strip()
    if not token:
        print(
            "COMPANION_TOKEN is required (non-empty).\n"
            "  Put COMPANION_TOKEN=… in project .env, or:\n"
            "  export COMPANION_TOKEN='$(openssl rand -hex 16)'\n"
            "  # paste the same value into the PWA → Settings → Desktop companion",
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

    data_dir = companion_data_dir()
    hub = ExclusiveHub(
        companion_token=token, mpv_path=mpv_path, data_dir=data_dir
    )
    app = create_exclusive_app(hub)

    print(
        banner_lines(port, mpv_path, data_dir),
        flush=True,
    )

    # Loopback only — never bind 0.0.0.0.
    # Legacy uvicorn ws="websockets" is deprecated; pin non-deprecated adapter
    # (not a change to the companion JSON protocol).
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=False,
        ws="websockets-sansio",
    )


def companion(
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
    """Desktop companion: loopback hog (macOS) and Downloads blob store."""
    run_companion(port=port, mpv=mpv)
