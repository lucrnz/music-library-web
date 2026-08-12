"""Unix control client for CLI / runtime."""

from __future__ import annotations

import socket
from pathlib import Path
from typing import Any

from musicweb.control.protocol import (
    ControlRequest,
    ControlResponse,
    encode_frame,
    read_frame,
)
from musicweb.control.server import socket_path
from musicweb.jobs import ScanMode


class ControlError(RuntimeError):
    """Control RPC failed or returned ok=false."""


class ControlClient:
    def __init__(self, data_dir: Path, *, timeout: float = 10.0) -> None:
        self._path = socket_path(data_dir)
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

    def _call(self, method: str, **params: Any) -> ControlResponse:
        if not self._path.exists():
            raise ControlError(f"control socket missing: {self._path}")
        req = ControlRequest(method=method, params=params)
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self._timeout)
        try:
            sock.connect(str(self._path))
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
