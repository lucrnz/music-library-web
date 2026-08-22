"""Controller lock, heartbeats, and fan-out for exclusive companion clients."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from musicweb.exclusive import protocol as p
from musicweb.exclusive.coreaudio import AudioDevice, list_output_devices
from musicweb.exclusive.mpv_player import MpvPlayer

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

    def __init__(self, *, hog_token: str, mpv_path: str | None = None) -> None:
        self.hog_token = hog_token
        self._clients: dict[str, ClientSession] = {}
        self._controller_id: str | None = None
        self._device_id: str | None = None
        self._devices: list[AudioDevice] = []
        self._player = MpvPlayer(mpv_path=mpv_path, on_event=self._on_mpv_event)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._ttl_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    @property
    def player(self) -> MpvPlayer:
        return self._player

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def start_player(self) -> None:
        self._player.start()
        self._devices = list_output_devices()

    def stop(self) -> None:
        if self._ttl_task is not None:
            self._ttl_task.cancel()
            self._ttl_task = None
        self._player.close()

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

    async def _check_ttl(self) -> None:
        async with self._lock:
            cid = self._controller_id
            if not cid:
                return
            sess = self._clients.get(cid)
            if sess is None:
                self._controller_id = None
                await self._ensure_no_controller_exclusive()
                await self._broadcast_status_unlocked()
                return
            if time.monotonic() - sess.last_heartbeat > p.CONTROLLER_TTL_S:
                logger.info("Controller %s TTL expired", cid)
                sess.role = p.ROLE_READONLY
                self._controller_id = None
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
        if not token or token != self.hog_token:
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

    async def handle_disconnect(self, sess: ClientSession) -> None:
        async with self._lock:
            if not self._is_current(sess):
                return
            self._clients.pop(sess.session_id, None)
            if self._controller_id == sess.session_id:
                self._controller_id = None
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
            mtype = msg["type"]
            if mtype == p.MSG_HEARTBEAT:
                sess.last_heartbeat = time.monotonic()
                return
            live = self._is_live_controller(sess)

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

    async def _cmd_set_device(
        self, sess: ClientSession, msg: dict[str, Any]
    ) -> None:
        device_id = str(msg.get("deviceId") or msg.get("device_id") or "")
        if not device_id:
            raise ValueError("deviceId required")
        mpv_dev = device_id
        for d in self._devices:
            if d.id == device_id:
                mpv_dev = d.mpv_device or d.id
                break
        await asyncio.to_thread(self._player.set_device, mpv_dev)
        if not await self._with_live(sess):
            return
        async with self._lock:
            self._device_id = device_id

    async def _cmd_load(self, sess: ClientSession, msg: dict[str, Any]) -> None:
        async with self._lock:
            if not self._device_id:
                raise ValueError("select a device first")
        url = str(msg.get("url") or "")
        if not url.startswith(("http://", "https://")):
            raise ValueError("absolute http(s) url required")
        await asyncio.to_thread(self._player.load, url)

    async def _cmd_pause(self, _sess: ClientSession, _msg: dict[str, Any]) -> None:
        await asyncio.to_thread(self._player.pause)

    async def _cmd_resume(self, _sess: ClientSession, _msg: dict[str, Any]) -> None:
        await asyncio.to_thread(self._player.resume)

    async def _cmd_stop(self, _sess: ClientSession, _msg: dict[str, Any]) -> None:
        await asyncio.to_thread(self._player.stop)

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
    p.MSG_LOAD: (ExclusiveHub._cmd_load, True),
    p.MSG_PAUSE: (ExclusiveHub._cmd_pause, False),
    p.MSG_RESUME: (ExclusiveHub._cmd_resume, False),
    p.MSG_STOP: (ExclusiveHub._cmd_stop, True),
    p.MSG_SEEK: (ExclusiveHub._cmd_seek, False),
    p.MSG_SET_VOLUME: (ExclusiveHub._cmd_set_volume, True),
}
