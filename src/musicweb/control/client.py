"""Control client for CLI / runtime (UDS or loopback TCP)."""

from __future__ import annotations

import socket
from pathlib import Path
from typing import Any

from musicweb.control.endpoint import parse_tcp_endpoint, socket_path, tcp_endpoint_path
from musicweb.control.protocol import (
    ControlRequest,
    ControlResponse,
    encode_frame,
    read_frame,
)
from musicweb.jobs import ScanMode


class ControlError(RuntimeError):
    """Control RPC failed or returned ok=false."""


class ControlClient:
    def __init__(self, data_dir: Path, *, timeout: float = 10.0) -> None:
        self._data_dir = Path(data_dir)
        self._timeout = timeout

    def health(self) -> bool:
        try:
            resp = self._call("health")
            return bool(resp.ok)
        except Exception:
            return False

    def job_status(self) -> dict[str, Any]:
        return self._call("job_status").result

    def cancel_job(self) -> dict[str, Any]:
        return self._call("cancel_job").result

    def start_scan(self, mode: ScanMode = "quick") -> dict[str, Any]:
        return self._call("start_scan", mode=mode).result

    def start_regen_covers(self, force: bool = False) -> dict[str, Any]:
        return self._call("start_regen_covers", force=force).result

    def start_regen_artist_images(self, force: bool = False) -> dict[str, Any]:
        return self._call("start_regen_artist_images", force=force).result

    def start_regen_lyrics(self, force: bool = False) -> dict[str, Any]:
        return self._call("start_regen_lyrics", force=force).result

    def radio_status(self, *, spoilers: bool = False) -> dict[str, Any]:
        return self._call("radio_status", spoilers=spoilers).result

    def radio_skip(self, *, spoilers: bool = False) -> dict[str, Any]:
        return self._call("radio_skip", spoilers=spoilers).result

    def radio_play(self, track_id: str, *, spoilers: bool = False) -> dict[str, Any]:
        return self._call("radio_play", track_id=track_id, spoilers=spoilers).result

    def radio_pick(self, *, spoilers: bool = False) -> dict[str, Any]:
        return self._call("radio_pick", spoilers=spoilers).result

    def radio_reset(self, *, spoilers: bool = False) -> dict[str, Any]:
        return self._call("radio_reset", spoilers=spoilers).result

    def radio_banlist(self, *, spoilers: bool = False) -> dict[str, Any]:
        return self._call("radio_banlist", spoilers=spoilers).result

    def radio_skip_ids(self) -> dict[str, Any]:
        return self._call("radio_skip_ids").result

    def radio_skip_ids_clear(self) -> dict[str, Any]:
        return self._call("radio_skip_ids_clear").result

    def _connect(self) -> socket.socket:
        sock_file = socket_path(self._data_dir)
        tcp_file = tcp_endpoint_path(self._data_dir)
        if sock_file.exists() and hasattr(socket, "AF_UNIX"):
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(self._timeout)
            sock.connect(str(sock_file))
            return sock
        if tcp_file.exists():
            host, port = parse_tcp_endpoint(tcp_file)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self._timeout)
            sock.connect((host, port))
            return sock
        raise ControlError(
            f"control endpoint missing: {sock_file} or {tcp_file}"
        )

    def _call(self, method: str, **params: Any) -> ControlResponse:
        req = ControlRequest(method=method, params=params)
        sock = self._connect()
        try:
            sock.sendall(encode_frame(req))
            raw = read_frame(sock)
            resp = ControlResponse.model_validate(raw)
        except OSError as exc:
            raise ControlError(f"control connect failed: {exc}") from exc
        finally:
            try:
                sock.close()
            except OSError:
                pass
        if not resp.ok:
            raise ControlError(resp.error or "control request failed")
        return resp
