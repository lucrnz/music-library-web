"""Run the loopback Desktop companion (no data-dir lock / DB)."""

from __future__ import annotations

import logging
import os
import re
import shutil
import socket
import sys
from collections.abc import Callable
from pathlib import Path

import typer
import uvicorn

from musicweb.config import load_env_file
from musicweb.exclusive.app import create_exclusive_app
from musicweb.exclusive.paths import companion_data_dir
from musicweb.exclusive.platform import hog_supported
from musicweb.exclusive.protocol import DEFAULT_PORT, PROTOCOL_VERSION
from musicweb.exclusive.session import ExclusiveHub

logger = logging.getLogger(__name__)

MPV_STUB_LABEL = "stub (this platform)"
_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"
_DEBUG_ON = frozenset({"1", "true"})
_DEBUG_OFF = frozenset({"0", "false", ""})
_WS_TIME_LOGGERS = ("uvicorn.error", "websockets", "websockets.server")
_WS_TIME_TYPE = re.compile(r'"type"\s*:\s*"time"\s*[,}]')


class DropWsTimeFrames(logging.Filter):
    """Drop websocket TEXT dumps of exclusive time-pos updates."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        if "TEXT" not in msg:
            return True
        return _WS_TIME_TYPE.search(msg) is None


_WS_TIME_FILTER = DropWsTimeFrames()


def _silence_ws_time_frames() -> None:
    for name in _WS_TIME_LOGGERS:
        log = logging.getLogger(name)
        if not any(isinstance(f, DropWsTimeFrames) for f in log.filters):
            log.addFilter(_WS_TIME_FILTER)


def resolve_debug_env(raw: str | None) -> tuple[bool, str | None]:
    """Interpret DEBUG as true/1 on, false/0/empty/unset off.

    Returns ``(enabled, warning)``. Unknown tokens are off with a warning.
    """
    if raw is None:
        return False, None
    token = raw.strip().lower()
    if token in _DEBUG_ON:
        return True, None
    if token in _DEBUG_OFF:
        return False, None
    return False, f"DEBUG={raw.strip()!r} is not true/false/0/1; treating as off"


def configure_companion_logging(*, debug: bool) -> None:
    """Raise or keep the process log level. Safe if ``main()`` already configured."""
    level = logging.DEBUG if debug else logging.INFO
    root = logging.getLogger()
    root.setLevel(level)
    if not root.handlers:
        logging.basicConfig(level=level, format=_LOG_FORMAT)
    else:
        for handler in root.handlers:
            if handler.level == logging.NOTSET or handler.level > level:
                handler.setLevel(level)
    _silence_ws_time_frames()


def banner_lines(
    port: int, mpv_path: str, data_dir: Path, *, debug: bool = False
) -> str:
    lines = [
        f"musicweb companion  protocol v{PROTOCOL_VERSION}",
        f"  listening  ws://127.0.0.1:{port}/ws",
        f"  health     http://127.0.0.1:{port}/health",
        f"  files      {data_dir}",
        f"  mpv        {mpv_path}",
        "  COMPANION_TOKEN  set — paste the same value into PWA settings",
    ]
    if debug:
        lines.append("  debug      verbose")
    return "\n".join(lines)


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


def serve_loopback(
    app: object,
    port: int,
    on_bound: Callable[[], None],
    *,
    log_level: str = "info",
) -> None:
    """Bind 127.0.0.1 and print *on_bound* only after the listen succeeds."""
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level=log_level,
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
    if not hog_supported():
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
    debug, debug_warn = resolve_debug_env(os.environ.get("DEBUG"))
    configure_companion_logging(debug=debug)
    if debug_warn:
        print(debug_warn, file=sys.stderr)
    if debug:
        logger.debug("DEBUG enabled — verbose companion logging")

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
        lambda: print(
            banner_lines(port, banner_mpv, data_dir, debug=debug), flush=True
        ),
        log_level="debug" if debug else "info",
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
        help="Path to mpv binary (required for hog on macOS and Windows; ignored on the Linux stub)",
    ),
) -> None:
    """Desktop companion: loopback hog (macOS / Windows) and Downloads blob store.

    Requires COMPANION_TOKEN in the project .env or the process environment.
    Binds 127.0.0.1 only. mpv is required on macOS and Windows. On Linux exclusive
    hog is a no-op stub so Downloads still start. DEBUG=true or 1 enables
    verbose logs, including exclusive volume path decisions (false / 0 / unset
    stay at INFO).
    """
    run_companion(port=port, mpv=mpv)
