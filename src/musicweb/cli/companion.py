"""Run the loopback Desktop companion (no data-dir lock / DB)."""

from __future__ import annotations

import logging
import os
import shutil
import socket
import sys
from collections.abc import Callable
from pathlib import Path

import typer
import uvicorn

from musicweb.config import load_env_file
from musicweb.exclusive.app import create_exclusive_app
from musicweb.exclusive.coreaudio import is_macos
from musicweb.exclusive.paths import companion_data_dir
from musicweb.exclusive.protocol import DEFAULT_PORT, PROTOCOL_VERSION
from musicweb.exclusive.session import ExclusiveHub

logger = logging.getLogger(__name__)

MPV_STUB_LABEL = "stub (this platform)"


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


def check_loopback_port(port: int) -> None:
    if not (1 <= port <= 65535):
        print("port must be 1–65535", file=sys.stderr)
        raise SystemExit(1)
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(("127.0.0.1", port))
    except OSError as exc:
        print(f"could not bind 127.0.0.1:{port}: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    finally:
        probe.close()


def serve_loopback(app: object, port: int, on_bound: Callable[[], None]) -> None:
    """Bind 127.0.0.1 and print *on_bound* only after the listen succeeds."""
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=False,
        ws="websockets-sansio",
    )
    server = uvicorn.Server(config)
    orig_startup = server.startup

    async def startup_then_banner(
        sockets: list[socket.socket] | None = None,
    ) -> None:
        await orig_startup(sockets=sockets)
        if server.started:
            on_bound()

    server.startup = startup_then_banner  # type: ignore[method-assign]
    try:
        server.run()
    except SystemExit:
        if not server.started:
            print(
                f"companion failed to start on 127.0.0.1:{port}",
                file=sys.stderr,
            )
        raise


def _resolve_mpv(mpv: str | None) -> str | None:
    if not is_macos():
        print(
            "Warning: exclusive hog is a no-op stub on this platform; "
            "Downloads blob store still runs.",
            file=sys.stderr,
        )
        if mpv:
            print("note: --mpv ignored; hog is stubbed", file=sys.stderr)
        return None
    if mpv:
        if not os.path.isfile(mpv) or not os.access(mpv, os.X_OK):
            print(f"mpv not executable: {mpv}", file=sys.stderr)
            raise SystemExit(1)
        return mpv
    mpv_path = shutil.which("mpv")
    if not mpv_path:
        print(
            "mpv not found on PATH. Install mpv or pass --mpv /path/to/mpv.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return mpv_path


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
            "  export COMPANION_TOKEN=\"$(openssl rand -hex 16)\"\n"
            "  # paste the same value into the PWA → Settings → Desktop companion",
            file=sys.stderr,
        )
        raise SystemExit(1)

    check_loopback_port(port)
    mpv_path = _resolve_mpv(mpv)
    banner_mpv = mpv_path if mpv_path is not None else MPV_STUB_LABEL

    data_dir = companion_data_dir()
    hub = ExclusiveHub(
        companion_token=token, mpv_path=mpv_path, data_dir=data_dir
    )
    app = create_exclusive_app(hub)

    # Loopback only — never bind 0.0.0.0.
    # Legacy uvicorn ws="websockets" is deprecated; pin non-deprecated adapter
    # (not a change to the companion JSON protocol).
    serve_loopback(
        app,
        port,
        lambda: print(banner_lines(port, banner_mpv, data_dir), flush=True),
    )


def companion(
    port: int = typer.Option(
        DEFAULT_PORT,
        "--port",
        min=1,
        max=65535,
        help=f"Loopback port (default {DEFAULT_PORT})",
    ),
    mpv: str | None = typer.Option(
        None,
        "--mpv",
        help="Path to mpv binary (macOS hog; ignored on Windows/Linux stub)",
    ),
) -> None:
    """Desktop companion: loopback hog (macOS) and Downloads blob store.

    Requires COMPANION_TOKEN in the project .env or the process environment.
    Binds 127.0.0.1 only. mpv is required on macOS. On Windows/Linux exclusive
    hog is a no-op stub so Downloads still start.
    """
    run_companion(port=port, mpv=mpv)
