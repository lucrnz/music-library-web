"""Control-plane endpoint paths and TCP port-file helpers."""

from __future__ import annotations

import sys
from pathlib import Path

_LOOPBACK_HOST = "127.0.0.1"


def socket_path(data_dir: Path) -> Path:
    return Path(data_dir) / "musicweb.sock"


def tcp_endpoint_path(data_dir: Path) -> Path:
    return Path(data_dir) / "musicweb.control"


def default_transport() -> str:
    return "tcp" if sys.platform == "win32" else "uds"


def write_tcp_endpoint(path: Path, host: str, port: int) -> None:
    if host != _LOOPBACK_HOST:
        raise ValueError("control endpoint host must be loopback")
    if not (1 <= int(port) <= 65535):
        raise ValueError("invalid control endpoint port")
    path.write_text(f"{host}:{int(port)}\n", encoding="utf-8")


def parse_tcp_endpoint(path: Path) -> tuple[str, int]:
    text = path.read_text(encoding="utf-8").strip()
    host, sep, port_s = text.rpartition(":")
    if not sep or not host or not port_s:
        raise ValueError("invalid control endpoint")
    host = host.strip()
    if host != _LOOPBACK_HOST:
        raise ValueError("control endpoint host must be loopback")
    try:
        port = int(port_s)
    except ValueError as exc:
        raise ValueError("invalid control endpoint port") from exc
    if not (1 <= port <= 65535):
        raise ValueError("invalid control endpoint port")
    return host, port
