"""Controller lock, heartbeats, and fan-out for exclusive companion clients."""

from __future__ import annotations

import asyncio
import errno
import logging
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from musicweb.exclusive import blob_store
from musicweb.exclusive import protocol as p
from musicweb.exclusive.coreaudio import AudioDevice, list_output_devices
from musicweb.exclusive.mpv_player import MpvPlayer
from musicweb.exclusive.optical_session import OpticalSession
from musicweb.exclusive.paths import companion_data_dir

logger = logging.getLogger(__name__)


@dataclass
class ClientSession:
    session_id: str
    websocket: Any  # starlette WebSocket
    role: str
    last_heartbeat: float = field(default_factory=time.monotonic)
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class ExclusiveHub:
    """Process-wide companion state (one hub per companion process)."""

    def __init__(
        self,
        *,
        companion_token: str,
        mpv_path: str | None = None,
        data_dir: Path | None = None,
    ) -> None:
        self.companion_token = companion_token
        self.data_dir = Path(data_dir) if data_dir is not None else companion_data_dir()
        self._clients: dict[str, ClientSession] = {}
        self._controller_id: str | None = None
        self._device_id: str | None = None
        self._devices: list[AudioDevice] = []
        self._player = MpvPlayer(mpv_path=mpv_path, on_event=self._on_mpv_event)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._ttl_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        self._blob_aborts: dict[str, threading.Event] = {}
        self._reclaim_id: str | None = None
        self._rearm_device_id: str | None = None
        self.optical = OpticalSession()

    @property
    def player(self) -> MpvPlayer:
        return self._player

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def start_player(self) -> None:
        """No-op. The mpv child starts on set_device/load; devices list on demand."""
        return

    def _shutdown_player_if_idle(self) -> None:
        if self._device_id is not None:
            return
        if self._player.status_snapshot().get("url"):
            return
        self._player.shutdown_process()

    def stop(self) -> None:
        if self._ttl_task is not None:
            self._ttl_task.cancel()
            self._ttl_task = None
        self.optical.cancel_watch()
        for ev in list(self._blob_aborts.values()):
            ev.set()
        self._player.close()

    def _cancel_optical_watch(self) -> None:
        self.optical.cancel_watch()

    def drop_cdda_reader(self) -> None:
        self.optical.drop_reader()

    def cdda_allowed_device(self) -> str | None:
        return self.optical.allowed_device()

    def open_cdda_track(self, device_id: str, track_no: int):
        return self.optical.open_track(device_id, track_no)

    @property
    def _optical(self):
        return self.optical.port

    @_optical.setter
    def _optical(self, port) -> None:
        self.optical.port = port

    @property
    def _optical_watch_task(self):
        return self.optical.watch_task

    def ensure_ttl_watch(self) -> None:
        if self._ttl_task is None and self._loop is not None:
            self._ttl_task = self._loop.create_task(self._ttl_loop())

    async def _ttl_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(1.0)
                await self._check_ttl()
        except asyncio.CancelledError:
            return

    async def _ensure_no_controller_exclusive(self) -> None:
        """Drop exclusive hold after controller is gone. Call only when _controller_id is None."""
        if self._controller_id is not None:
            return
        # Release mpv first; only clear hub device id after success (honest status on failure).
        await asyncio.to_thread(self._player.release_device)
        self._device_id = None
        await asyncio.to_thread(self._shutdown_player_if_idle)

    async def _check_ttl(self) -> None:
        async with self._lock:
            cid = self._controller_id
            if not cid:
                return
            sess = self._clients.get(cid)
            if sess is None:
                self._controller_id = None
                self._reclaim_id = None
                await self._ensure_no_controller_exclusive()
                await self._broadcast_status_unlocked()
                return
            silent = time.monotonic() - sess.last_heartbeat
            if silent <= p.CONTROLLER_TTL_S:
                return
            if self._player.status_snapshot().get("url"):
                return
            logger.info(
                "Controller %s idle %.0fs; released hog (reclaim on activity)",
                cid,
                silent,
            )
            sess.role = p.ROLE_READONLY
            self._reclaim_id = cid
            if self._device_id:
                self._rearm_device_id = self._device_id
            self._controller_id = None
            self._cancel_optical_watch()
            await self._ensure_no_controller_exclusive()
            await self._broadcast_status_unlocked()
            try:
                await self._send(
                    sess,
                    p.envelope(
                        p.MSG_STATUS,
                        role=p.ROLE_READONLY,
                        reason="controller_ttl",
                        **self._status_fields(),
                    ),
                )
            except Exception:
                pass

    def _on_mpv_event(self, event: str, payload: dict[str, Any]) -> None:
        loop = self._loop
        if loop is None:
            return
        asyncio.run_coroutine_threadsafe(
            self._fanout_mpv_event(event, payload), loop
        )

    async def _fanout_mpv_event(
        self, event: str, payload: dict[str, Any]
    ) -> None:
        if event == "time":
            msg = p.envelope(p.MSG_TIME, t=payload.get("t"), d=payload.get("d"))
        elif event == "pause":
            msg = p.envelope(
                p.MSG_PAUSE_EVENT, paused=bool(payload.get("paused"))
            )
        elif event == "eof":
            msg = p.envelope(p.MSG_EOF)
        elif event == "error":
            msg = p.envelope(
                p.MSG_ERROR, message=str(payload.get("message") or "mpv error")
            )
        else:
            return
        await self.broadcast(msg)

    async def broadcast(self, msg: dict[str, Any]) -> None:
        async with self._lock:
            sessions = list(self._clients.values())
        for sess in sessions:
            try:
                await self._send(sess, msg)
            except Exception:
                pass

    async def _send(self, sess: ClientSession, msg: dict[str, Any]) -> None:
        async with sess.send_lock:
            await sess.websocket.send_json(msg)

    def _status_fields(self) -> dict[str, Any]:
        snap = self._player.status_snapshot()
        return {
            "controller_session_id": self._controller_id,
            "selected_device_id": self._device_id,
            "playing": bool(snap.get("url")) and not snap.get("paused"),
            "data_dir": str(self.data_dir),
            **snap,
        }

    async def _broadcast_status_unlocked(self) -> None:
        base = self._status_fields()
        for sess in list(self._clients.values()):
            try:
                await self._send(
                    sess,
                    p.envelope(p.MSG_STATUS, role=sess.role, **base),
                )
            except Exception:
                pass

    async def handle_connect_hello(
        self,
        websocket: Any,
        token: str,
        session_id: str,
    ) -> ClientSession | None:
        if not p.token_ok(token, self.companion_token):
            logger.info("Client rejected (invalid_token)")
            await websocket.send_json(
                p.envelope(p.MSG_HELLO_REJECT, reason="invalid_token")
            )
            return None
        if not session_id:
            await websocket.send_json(
                p.envelope(p.MSG_HELLO_REJECT, reason="missing_session_id")
            )
            return None

        old: ClientSession | None = None
        async with self._lock:
            old = self._clients.pop(session_id, None)
            if self._controller_id is None or self._controller_id == session_id:
                role = p.ROLE_CONTROLLER
                self._controller_id = session_id
                self._reclaim_id = None
            else:
                role = p.ROLE_READONLY

            sess = ClientSession(
                session_id=session_id,
                websocket=websocket,
                role=role,
            )
            self._clients[session_id] = sess
            self.ensure_ttl_watch()

        if old is not None:
            try:
                await old.websocket.close()
            except Exception:
                pass

        await self._send(
            sess,
            p.envelope(
                p.MSG_HELLO_OK,
                role=role,
                sessionId=session_id,
                **self._status_fields(),
            ),
        )
        await self._send(
            sess,
            p.envelope(p.MSG_STATUS, role=role, **self._status_fields()),
        )
        return sess

    def _is_current(self, sess: ClientSession) -> bool:
        return self._clients.get(sess.session_id) is sess

    def _is_live_controller(self, sess: ClientSession) -> bool:
        return (
            self._is_current(sess)
            and sess.role == p.ROLE_CONTROLLER
            and self._controller_id == sess.session_id
        )

    def _mpv_device_for(self, device_id: str) -> str:
        for d in self._devices:
            if d.id == device_id:
                return d.mpv_device or d.id
        return device_id

    def _promote_reclaim_unlocked(
        self, sess: ClientSession
    ) -> tuple[bool, str | None]:
        """If this session owns idle reclaim, become controller. Return (promoted, rearm id)."""
        if self._controller_id is not None:
            return False, None
        if self._reclaim_id != sess.session_id:
            return False, None
        sess.role = p.ROLE_CONTROLLER
        self._controller_id = sess.session_id
        self._reclaim_id = None
        logger.info(
            "Controller %s reclaimed",
            sess.session_id,
        )
        return True, self._rearm_device_id

    async def _rearm_device(self, sess: ClientSession, device_id: str) -> None:
        await asyncio.to_thread(
            self._player.set_device, self._mpv_device_for(device_id)
        )
        if not await self._with_live(sess):
            if await self._should_undo_player():
                await asyncio.to_thread(self._player.release_device)
            return
        async with self._lock:
            self._device_id = device_id
            await self._broadcast_status_unlocked()

    async def handle_disconnect(self, sess: ClientSession) -> None:
        async with self._lock:
            if not self._is_current(sess):
                return
            self._clients.pop(sess.session_id, None)
            if self._reclaim_id == sess.session_id:
                self._reclaim_id = None
            if self._controller_id == sess.session_id:
                self._controller_id = None
                self._reclaim_id = None
                self._cancel_optical_watch()
                logger.info(
                    "Controller %s disconnected; lock free", sess.session_id
                )
                await self._ensure_no_controller_exclusive()
            await self._broadcast_status_unlocked()

    async def handle_message(
        self, sess: ClientSession, msg: dict[str, Any]
    ) -> None:
        async with self._lock:
            if not self._is_current(sess):
                return
            sess.last_heartbeat = time.monotonic()
            mtype = msg["type"]
            promoted, rearm = self._promote_reclaim_unlocked(sess)
            live = self._is_live_controller(sess)

        if promoted:
            if rearm:
                await self._rearm_device(sess, rearm)
            else:
                async with self._lock:
                    await self._broadcast_status_unlocked()

        if mtype == p.MSG_HEARTBEAT:
            return

        if mtype in p.BLOB_CLIENT_TYPES:
            try:
                await self._handle_blob(sess, mtype, msg)
            except Exception as exc:
                logger.exception("blob command failed: %s", exc)
                await self._send(
                    sess,
                    p.envelope(p.MSG_ERROR, message=str(exc)),
                )
            return

        if mtype == p.MSG_LIST_DEVICES:
            async with self._lock:
                if not self._is_current(sess):
                    return
            self._devices = list_output_devices()
            await self._send(
                sess,
                p.envelope(
                    p.MSG_DEVICES,
                    devices=[d.to_dict() for d in self._devices],
                ),
            )
            return

        if not live:
            await self._send(
                sess,
                p.envelope(
                    p.MSG_ERROR,
                    message="controlled elsewhere",
                    code="readonly",
                ),
            )
            return

        try:
            await self._handle_controller(sess, mtype, msg)
        except Exception as exc:
            logger.exception("controller command failed: %s", exc)
            await self._send(
                sess,
                p.envelope(p.MSG_ERROR, message=str(exc)),
            )

    async def _with_live(self, sess: ClientSession) -> bool:
        async with self._lock:
            return self._is_live_controller(sess)

    async def _should_undo_player(self) -> bool:
        """Undo in-flight hog only when no session owns the lock."""
        async with self._lock:
            return self._controller_id is None

    async def _cmd_release_device(
        self, sess: ClientSession, _msg: dict[str, Any]
    ) -> None:
        """Drop hog even if a stream is loaded. Controller claim stays."""
        await asyncio.to_thread(self._player.release_device)
        if not await self._with_live(sess):
            return
        async with self._lock:
            self._device_id = None
            self._rearm_device_id = None
        logger.info(
            "Controller %s released exclusive device", sess.session_id
        )
        await asyncio.to_thread(self._shutdown_player_if_idle)

    async def _cmd_list_optical_drives(
        self, sess: ClientSession, _msg: dict[str, Any]
    ) -> None:
        await self.optical.list_drives(
            sess, send=self._send, live=self._with_live, broadcast=self.broadcast
        )

    async def _cmd_watch_optical(
        self, sess: ClientSession, msg: dict[str, Any]
    ) -> None:
        await self.optical.watch(msg, broadcast=self.broadcast)

    async def _cmd_read_optical(
        self, sess: ClientSession, msg: dict[str, Any]
    ) -> None:
        await self.optical.read(
            sess, msg, live=self._with_live, broadcast=self.broadcast
        )

    async def _cmd_eject_optical(
        self, sess: ClientSession, msg: dict[str, Any]
    ) -> None:
        await self.optical.eject(
            sess, msg, send=self._send, broadcast=self.broadcast
        )

    async def _cmd_list_cdrom(
        self, sess: ClientSession, msg: dict[str, Any]
    ) -> None:
        await self.optical.list_cdrom(
            sess, msg, send=self._send, live=self._with_live
        )

    async def _cmd_set_device(
        self, sess: ClientSession, msg: dict[str, Any]
    ) -> None:
        device_id = str(msg.get("deviceId") or msg.get("device_id") or "")
        if not device_id:
            raise ValueError("deviceId required")
        await asyncio.to_thread(
            self._player.set_device, self._mpv_device_for(device_id)
        )
        if not await self._with_live(sess):
            if await self._should_undo_player():
                await asyncio.to_thread(self._player.release_device)
            return
        async with self._lock:
            self._device_id = device_id
            self._rearm_device_id = device_id

    async def _cmd_load(self, sess: ClientSession, msg: dict[str, Any]) -> None:
        hog = True if "hog" not in msg else bool(msg.get("hog"))
        if hog:
            async with self._lock:
                if not self._device_id:
                    raise ValueError("select a device first")
        else:
            def _prepare_auto() -> None:
                self._player.start()
                self._player.use_auto_output()

            await asyncio.to_thread(_prepare_auto)
        url = p.require_http_url(str(msg.get("url") or ""))
        await asyncio.to_thread(self._player.load, url)
        if not await self._with_live(sess):
            if await self._should_undo_player():
                await asyncio.to_thread(self._player.release_device)
            return

    async def _cmd_pause(self, _sess: ClientSession, _msg: dict[str, Any]) -> None:
        await asyncio.to_thread(self._player.pause)

    async def _cmd_resume(self, _sess: ClientSession, _msg: dict[str, Any]) -> None:
        await asyncio.to_thread(self._player.resume)

    async def _cmd_stop(self, _sess: ClientSession, _msg: dict[str, Any]) -> None:
        await asyncio.to_thread(self._player.stop)
        await asyncio.to_thread(self._shutdown_player_if_idle)

    async def _cmd_seek(self, _sess: ClientSession, msg: dict[str, Any]) -> None:
        t = msg.get("t")
        if t is None:
            t = msg.get("position")
        if t is None:
            raise ValueError("seek requires t")
        await asyncio.to_thread(self._player.seek, float(t))

    async def _cmd_set_volume(
        self, _sess: ClientSession, msg: dict[str, Any]
    ) -> None:
        vol = msg.get("volume")
        if vol is None:
            raise ValueError("volume required")
        await asyncio.to_thread(self._player.set_volume, float(vol))

    async def _handle_blob(
        self, sess: ClientSession, mtype: str, msg: dict[str, Any]
    ) -> None:
        if mtype == p.MSG_DISK_INFO:
            free = await asyncio.to_thread(blob_store.disk_free, self.data_dir)
            await self._send(
                sess,
                p.envelope(
                    p.MSG_DISK_INFO_OK,
                    free=free,
                    data_dir=str(self.data_dir),
                ),
            )
            return
        if mtype == p.MSG_BLOB_STAT:
            key = str(msg.get("key") or "")
            exists, nbytes = await asyncio.to_thread(
                blob_store.stat, self.data_dir, key
            )
            await self._send(
                sess,
                p.envelope(p.MSG_BLOB_STAT_OK, key=key, exists=exists, bytes=nbytes),
            )
            return
        if mtype == p.MSG_BLOB_DELETE:
            key = str(msg.get("key") or "")
            await asyncio.to_thread(blob_store.delete, self.data_dir, key)
            await self._send(
                sess, p.envelope(p.MSG_BLOB_STAT_OK, key=key, exists=False, bytes=0)
            )
            return
        if mtype == p.MSG_BLOB_ABORT:
            rid = str(msg.get("requestId") or "")
            ev = self._blob_aborts.get(rid)
            if ev is not None:
                ev.set()
            return
        if mtype == p.MSG_BLOB_PUT:
            await self._blob_put(sess, msg)

    async def _blob_put(self, sess: ClientSession, msg: dict[str, Any]) -> None:
        request_id = str(msg.get("requestId") or "")
        key = str(msg.get("key") or "")
        url = str(msg.get("url") or "")
        offset = int(msg.get("offset") or 0)
        if not request_id or not key or not url:
            raise ValueError("requestId, key, and url required")
        try:
            p.require_http_url(url)
        except ValueError as exc:
            await self._send(
                sess,
                p.envelope(
                    p.MSG_BLOB_ERROR,
                    requestId=request_id,
                    key=key,
                    code="http",
                    message=str(exc),
                ),
            )
            return
        abort = threading.Event()
        self._blob_aborts[request_id] = abort
        loop = asyncio.get_running_loop()

        def progress(loaded: int, total: int | None) -> None:
            try:
                fut = asyncio.run_coroutine_threadsafe(
                    self._send(
                        sess,
                        p.envelope(
                            p.MSG_BLOB_PROGRESS,
                            requestId=request_id,
                            key=key,
                            loaded=loaded,
                            total=total,
                        ),
                    ),
                    loop,
                )
            except RuntimeError:
                return

            def _done(done: object) -> None:
                try:
                    done.result()  # type: ignore[attr-defined]
                except Exception:
                    logger.debug("blob progress send failed", exc_info=True)

            fut.add_done_callback(_done)

        try:
            nbytes = await asyncio.to_thread(
                self._fetch_url_to_blob, url, key, offset, abort, progress
            )
            await self._send(
                sess,
                p.envelope(
                    p.MSG_BLOB_DONE, requestId=request_id, key=key, bytes=nbytes
                ),
            )
        except InterruptedError:
            await self._send(
                sess,
                p.envelope(
                    p.MSG_BLOB_ERROR,
                    requestId=request_id,
                    key=key,
                    code="abort",
                    message="aborted",
                ),
            )
        except OSError as exc:
            code = "enospc" if exc.errno == errno.ENOSPC else "http"
            await self._send(
                sess,
                p.envelope(
                    p.MSG_BLOB_ERROR,
                    requestId=request_id,
                    key=key,
                    code=code,
                    message=str(exc),
                ),
            )
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as exc:
            await self._send(
                sess,
                p.envelope(
                    p.MSG_BLOB_ERROR,
                    requestId=request_id,
                    key=key,
                    code="http",
                    message=str(exc),
                ),
            )
        finally:
            self._blob_aborts.pop(request_id, None)

    def _fetch_url_to_blob(
        self,
        url: str,
        key: str,
        offset: int,
        abort: threading.Event,
        progress: Callable[[int, int | None], None],
    ) -> int:
        p.require_http_url(url)
        blob_store.safe_key(key)
        dest = blob_store.resolve(self.data_dir, key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if offset <= 0:
            blob_store.partial_path(dest).unlink(missing_ok=True)
            dest.unlink(missing_ok=True)
            offset = 0
        req = urllib.request.Request(url)
        if offset > 0:
            req.add_header("Range", f"bytes={offset}-")
        try:
            resp = urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as exc:
            if offset > 0 and exc.code == 416:
                dest = blob_store.resolve(self.data_dir, key)
                blob_store.partial_path(dest).unlink(missing_ok=True)
                return self._fetch_url_to_blob(url, key, 0, abort, progress)
            raise
        try:
            loaded = offset
            status = getattr(resp, "status", 200)
            if offset > 0 and status != 206:
                dest = blob_store.resolve(self.data_dir, key)
                dest.parent.mkdir(parents=True, exist_ok=True)
                blob_store.partial_path(dest).write_bytes(b"")
                loaded = 0
            total: int | None = None
            cr = resp.headers.get("Content-Range")
            if cr and "/" in cr:
                try:
                    total = int(cr.rsplit("/", 1)[1])
                except ValueError:
                    total = None
            elif resp.headers.get("Content-Length"):
                try:
                    total = loaded + int(resp.headers["Content-Length"])
                except ValueError:
                    total = None
            while True:
                if abort.is_set():
                    raise InterruptedError("abort")
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                loaded = blob_store.append_chunk(
                    self.data_dir, key, chunk, offset=loaded
                )
                progress(loaded, total)
        finally:
            resp.close()
        return blob_store.promote_partial(self.data_dir, key, size=loaded)

    async def _handle_controller(
        self, sess: ClientSession, mtype: str, msg: dict[str, Any]
    ) -> None:
        spec = COMMANDS.get(mtype)
        if spec is None:
            if not await self._with_live(sess):
                return
            await self._send(
                sess,
                p.envelope(p.MSG_ERROR, message=f"unknown type {mtype}"),
            )
            return
        handler, broadcast = spec
        if not await self._with_live(sess):
            return
        await handler(self, sess, msg)
        if broadcast and await self._with_live(sess):
            await self.broadcast(p.envelope(p.MSG_STATUS, **self._status_fields()))


_Command = Callable[
    [ExclusiveHub, ClientSession, dict[str, Any]], Awaitable[None]
]
COMMANDS: dict[str, tuple[_Command, bool]] = {
    p.MSG_SET_DEVICE: (ExclusiveHub._cmd_set_device, True),
    p.MSG_RELEASE_DEVICE: (ExclusiveHub._cmd_release_device, True),
    p.MSG_LOAD: (ExclusiveHub._cmd_load, True),
    p.MSG_PAUSE: (ExclusiveHub._cmd_pause, False),
    p.MSG_RESUME: (ExclusiveHub._cmd_resume, False),
    p.MSG_STOP: (ExclusiveHub._cmd_stop, True),
    p.MSG_SEEK: (ExclusiveHub._cmd_seek, False),
    p.MSG_SET_VOLUME: (ExclusiveHub._cmd_set_volume, True),
    p.MSG_LIST_OPTICAL_DRIVES: (ExclusiveHub._cmd_list_optical_drives, False),
    p.MSG_WATCH_OPTICAL: (ExclusiveHub._cmd_watch_optical, False),
    p.MSG_READ_OPTICAL: (ExclusiveHub._cmd_read_optical, False),
    p.MSG_EJECT_OPTICAL: (ExclusiveHub._cmd_eject_optical, False),
    p.MSG_LIST_CDROM: (ExclusiveHub._cmd_list_cdrom, False),
}
