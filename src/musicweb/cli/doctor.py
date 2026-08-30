"""``musicweb doctor`` — hard environment checks."""

from __future__ import annotations

import sys

from musicweb.config import load_settings
from musicweb.control.client import ControlClient
from musicweb.control.endpoint import socket_path, tcp_endpoint_path
from musicweb.pwa_shell import frontend_dist_dir
from musicweb.runtime.bootstrap import bootstrap_services
from musicweb.runtime.lock import is_data_dir_locked
from musicweb.transcode import check_dependencies


def doctor() -> None:
    """Run hard checks: library path, data dir, ffmpeg, database, lock state."""
    ok = True
    settings = load_settings()

    lib = settings.music_library_path
    if not lib.is_dir():
        print(f"FAIL library path missing or not a directory: {lib}")
        ok = False
    else:
        print(f"OK   library path: {lib}")

    try:
        settings.ensure_data_dir()
        data = settings.musicweb_data_dir
        if not data.is_dir():
            print(f"FAIL data dir not a directory: {data}")
            ok = False
        else:
            print(f"OK   data dir: {data}")
    except OSError as exc:
        print(f"FAIL data dir: {exc}")
        ok = False

    locked = is_data_dir_locked(settings.musicweb_data_dir)
    print(
        f"INFO data-dir lock: {'held (server or writer likely running)' if locked else 'free'}"
    )

    sock = socket_path(settings.musicweb_data_dir)
    control = tcp_endpoint_path(settings.musicweb_data_dir)
    present: list[str] = []
    if sock.is_file():
        present.append("sock")
    if control.is_file():
        present.append("tcp")
    if not present:
        print("INFO control endpoint: absent")
    else:
        healthy = ControlClient(settings.musicweb_data_dir).health()
        state = "healthy" if healthy else "not healthy"
        print(f"INFO control endpoint: {', '.join(present)} present; {state}")

    try:
        report = check_dependencies()
        for name, ver in report.tools.items():
            print(f"OK   {name}: {ver[:72]}")
    except Exception as exc:
        print(f"FAIL ffmpeg/tools: {exc}")
        ok = False

    try:
        rt = bootstrap_services(settings, migrate=None)
        try:
            with rt.database.session() as session:
                session.connection()
            print("OK   database open")
        finally:
            rt.close()
    except Exception as exc:
        print(f"FAIL database: {exc}")
        ok = False

    if not (frontend_dist_dir() / "index.html").is_file():
        print("FAIL frontend dist missing; run: pnpm --dir frontend build")
        ok = False
    else:
        print("OK   frontend dist")

    if not ok:
        raise SystemExit(1)
    print("doctor: all hard checks passed")
