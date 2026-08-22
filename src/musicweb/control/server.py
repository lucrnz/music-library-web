"""Unix domain control server (health + library job + radio debug RPC)."""

from __future__ import annotations

import logging
import socket
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from musicweb.control.protocol import (
    ControlRequest,
    ControlResponse,
    encode_frame,
    read_frame,
)
from musicweb.jobs import JobKind, ScanMode
from musicweb.radio.debug import EmptyTuners, assemble_banlist, assemble_skip_ids, assemble_status
from musicweb.radio.types import DebugMutationResult

if TYPE_CHECKING:
    import asyncio

    from musicweb.jobs import LibraryJobRunner
    from musicweb.radio.station import RadioStation
    from musicweb.radio.tuners import TunerRegistry

logger = logging.getLogger(__name__)


def socket_path(data_dir: Path) -> Path:
    return Path(data_dir) / "musicweb.sock"


class ControlServer:
    """Background UDS accept loop; dispatches to LibraryJobRunner and radio."""

    def __init__(self, data_dir: Path, jobs: LibraryJobRunner) -> None:
        self._path = socket_path(data_dir)
        self._jobs = jobs
        self._sock: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._radio: RadioStation | None = None
        self._radio_tuners: TunerRegistry | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_radio(
        self,
        station: RadioStation,
        tuners: TunerRegistry,
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        self._radio = station
        self._radio_tuners = tuners
        self._loop = loop

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
            if method == "radio_status":
                return self._radio_status(bool(params.get("spoilers", False)))
            if method == "radio_skip":
                return self._radio_mutate(
                    "skip", bool(params.get("spoilers", False)), notify=True
                )
            if method == "radio_play":
                return self._radio_play(
                    str(params.get("track_id") or ""),
                    bool(params.get("spoilers", False)),
                )
            if method == "radio_pick":
                return self._radio_mutate(
                    "pick", bool(params.get("spoilers", False)), notify=False
                )
            if method == "radio_reset":
                return self._radio_mutate(
                    "reset", bool(params.get("spoilers", False)), notify=True
                )
            if method == "radio_banlist":
                return self._radio_banlist(bool(params.get("spoilers", False)))
            if method == "radio_skip_ids":
                return self._radio_skip_ids()
            if method == "radio_skip_ids_clear":
                return self._radio_skip_ids_clear()
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

    def _radio_bound(self) -> ControlResponse | None:
        if self._radio is None:
            return ControlResponse(ok=False, error="radio_unbound")
        return None

    def _tuners(self):
        return self._radio_tuners if self._radio_tuners is not None else EmptyTuners()

    def _radio_status(self, spoilers: bool) -> ControlResponse:
        missing = self._radio_bound()
        if missing is not None:
            return missing
        assert self._radio is not None
        now = datetime.now(timezone.utc)
        return ControlResponse(
            ok=True,
            result=assemble_status(
                self._radio, self._tuners(), now=now, spoilers=spoilers
            ),
        )

    def _radio_banlist(self, spoilers: bool) -> ControlResponse:
        missing = self._radio_bound()
        if missing is not None:
            return missing
        assert self._radio is not None
        return ControlResponse(
            ok=True,
            result=assemble_banlist(self._radio, spoilers=spoilers),
        )

    def _radio_skip_ids(self) -> ControlResponse:
        missing = self._radio_bound()
        if missing is not None:
            return missing
        assert self._radio is not None
        return ControlResponse(ok=True, result=assemble_skip_ids(self._radio))

    def _radio_skip_ids_clear(self) -> ControlResponse:
        missing = self._radio_bound()
        if missing is not None:
            return missing
        assert self._radio is not None
        self._radio.clear_skip_ids()
        return ControlResponse(ok=True, result=assemble_skip_ids(self._radio))

    def _radio_play(self, track_id: str, spoilers: bool) -> ControlResponse:
        missing = self._radio_bound()
        if missing is not None:
            return missing
        assert self._radio is not None
        now = datetime.now(timezone.utc)
        result = self._radio.operator_play(track_id, now)
        return self._finish_mutation(result, spoilers, notify=True)

    def _radio_mutate(
        self, verb: str, spoilers: bool, *, notify: bool
    ) -> ControlResponse:
        missing = self._radio_bound()
        if missing is not None:
            return missing
        assert self._radio is not None
        now = datetime.now(timezone.utc)
        if verb == "skip":
            result = self._radio.operator_skip(now)
        elif verb == "pick":
            result = self._radio.operator_pick(now)
        else:
            result = self._radio.operator_reset(now)
        return self._finish_mutation(result, spoilers, notify=notify)

    def _finish_mutation(
        self, result: DebugMutationResult, spoilers: bool, *, notify: bool
    ) -> ControlResponse:
        if not result.ok:
            return ControlResponse(ok=False, error=result.error)
        if notify and (result.changed_current or result.changed_started_at):
            self._schedule_notify()
        return self._radio_status(spoilers)

    def _schedule_notify(self) -> None:
        if self._loop is None or self._radio is None:
            return
        self._loop.call_soon_threadsafe(self._radio.notify_loop)
