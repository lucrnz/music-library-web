"""Unix domain control server (health + library job RPC)."""

from __future__ import annotations

import logging
import socket
import threading
from pathlib import Path
from typing import TYPE_CHECKING

from musicweb.control.protocol import (
    ControlRequest,
    ControlResponse,
    encode_frame,
    read_frame,
)
from musicweb.jobs import JobKind, ScanMode

if TYPE_CHECKING:
    from musicweb.jobs import LibraryJobRunner

logger = logging.getLogger(__name__)


def socket_path(data_dir: Path) -> Path:
    return Path(data_dir) / "musicweb.sock"


class ControlServer:
    """Background UDS accept loop; dispatches to LibraryJobRunner."""

    def __init__(self, data_dir: Path, jobs: LibraryJobRunner) -> None:
        self._path = socket_path(data_dir)
        self._jobs = jobs
        self._sock: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        if self._thread is not None:
            return
        if self._path.exists():
            try:
                self._path.unlink()
            except OSError:
                pass
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.bind(str(self._path))
        try:
            self._path.chmod(0o600)
        except OSError:
            pass
        sock.listen(8)
        sock.settimeout(0.5)
        self._sock = sock
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._serve_loop, name="musicweb-control", daemon=True
        )
        self._thread.start()
        logger.info("Control socket listening at %s", self._path)

    def stop(self) -> None:
        self._stop.set()
        sock = self._sock
        self._sock = None
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass
        thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=5)
        self._thread = None
        try:
            if self._path.exists():
                self._path.unlink()
        except OSError:
            pass

    def _serve_loop(self) -> None:
        assert self._sock is not None
        while not self._stop.is_set():
            try:
                conn, _ = self._sock.accept()
            except socket.timeout:
                continue
            except OSError:
                if self._stop.is_set():
                    break
                continue
            try:
                self._handle_conn(conn)
            except Exception:
                logger.exception("Control connection error")
            finally:
                try:
                    conn.close()
                except OSError:
                    pass

    def _handle_conn(self, conn: socket.socket) -> None:
        conn.settimeout(30)
        raw = read_frame(conn)
        req = ControlRequest.model_validate(raw)
        resp = self._dispatch(req)
        conn.sendall(encode_frame(resp))

    def _dispatch(self, req: ControlRequest) -> ControlResponse:
        method = req.method
        params = req.params
        try:
            if method == "health":
                return ControlResponse(ok=True, result={"status": "ok"})
            if method == "job_status":
                return ControlResponse(ok=True, result=self._jobs.status())
            if method == "cancel_job":
                ok = self._jobs.request_cancel()
                return ControlResponse(
                    ok=True, result={"canceling": ok, **self._jobs.status()}
                )
            if method == "start_scan":
                mode: ScanMode = params.get("mode") or "quick"
                if mode not in ("quick", "full"):
                    return ControlResponse(ok=False, error="invalid mode")
                started = self._jobs.start("scan", mode=mode)
                if not started:
                    return ControlResponse(ok=False, error="job busy")
                return ControlResponse(
                    ok=True, result={"started": True, **self._jobs.status()}
                )
            if method == "start_regen_covers":
                return self._start_regen("regen-covers", params)
            if method == "start_regen_artist_images":
                return self._start_regen("regen-artist-images", params)
            if method == "start_regen_lyrics":
                return self._start_regen("regen-lyrics", params)
            return ControlResponse(ok=False, error=f"unknown method: {method}")
        except Exception as exc:
            logger.exception("Control method %s failed", method)
            return ControlResponse(ok=False, error=str(exc)[:500])

    def _start_regen(
        self, kind: JobKind, params: dict
    ) -> ControlResponse:
        force = bool(params.get("force", False))
        started = self._jobs.start(kind, force=force)
        if not started:
            return ControlResponse(ok=False, error="job busy")
        return ControlResponse(
            ok=True, result={"started": True, **self._jobs.status()}
        )
