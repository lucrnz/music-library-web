"""Optical watch, list/read/eject, and CDDA open-gate for the companion."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from musicweb.exclusive import protocol as p
from musicweb.exclusive.optical import (
    OpticalError,
    OpticalMedia,
    OpticalPort,
    get_optical_port,
    media_signature,
)
logger = logging.getLogger(__name__)

BroadcastFn = Callable[[dict[str, Any]], Awaitable[None]]
SendFn = Callable[[Any, dict[str, Any]], Awaitable[None]]
LiveFn = Callable[[Any], Awaitable[bool]]


def device_id_from(msg: dict[str, Any]) -> str:
    return str(msg.get("deviceId") or msg.get("device_id") or "")


class OpticalSession:
    """Watch lifetime and tray commands. Not hog / ExclusiveHub policy."""

    def __init__(self, port: OpticalPort | None = None) -> None:
        self.port: OpticalPort = port if port is not None else get_optical_port()
        self._watch_task: asyncio.Task[None] | None = None
        self._watch_device: str | None = None
        self._last_device: str | None = None

    @property
    def watch_task(self) -> asyncio.Task[None] | None:
        return self._watch_task

    @property
    def watch_device(self) -> str | None:
        return self._watch_device

    def cancel_watch(self) -> None:
        task = self._watch_task
        self._watch_task = None
        self._watch_device = None
        if task is not None and not task.done():
            task.cancel()
        self.drop_reader()

    def drop_reader(self) -> None:
        try:
            self.port.drop_reader()
        except Exception:
            logger.debug("drop cdda reader failed", exc_info=True)

    def allowed_device(self) -> str | None:
        return self._watch_device or self._last_device

    def open_track(self, device_id: str, track_no: int):
        allowed = self.allowed_device()
        if not allowed:
            media = self.port.last_media()
            if media is not None and media.device_id == device_id and media.present:
                self._last_device = device_id
                allowed = device_id
        if not allowed or allowed != device_id:
            return None
        return self.port.open_track(device_id, track_no)

    async def list_drives(
        self,
        sess: Any,
        *,
        send: SendFn,
        live: LiveFn,
        broadcast: BroadcastFn,
    ) -> None:
        drives = await asyncio.to_thread(self.port.list_drives)
        hint = self.port.missing_lib_hint()
        if hint:
            await broadcast(
                p.envelope(
                    p.MSG_OPTICAL_ERROR,
                    message=hint,
                    code="libcdio_missing",
                )
            )
        if not await live(sess):
            return
        await send(
            sess,
            p.envelope(
                p.MSG_OPTICAL_DRIVES,
                drives=[d.to_dict() for d in drives],
            ),
        )

    async def watch(self, msg: dict[str, Any], *, broadcast: BroadcastFn) -> None:
        on = bool(msg.get("on"))
        self.cancel_watch()
        if not on:
            return
        device_id = device_id_from(msg)
        if not device_id:
            raise ValueError("deviceId required")
        self._watch_device = device_id
        self._last_device = device_id
        self._watch_task = asyncio.create_task(self._watch_loop(device_id, broadcast))

    async def _watch_loop(self, device_id: str, broadcast: BroadcastFn) -> None:
        last_sig: object = object()
        try:
            while True:
                try:
                    media = await asyncio.to_thread(self.port.read, device_id)
                except Exception as exc:
                    logger.exception("optical watch read failed")
                    await broadcast(
                        p.envelope(
                            p.MSG_OPTICAL_ERROR,
                            message=str(exc),
                            code="read",
                        )
                    )
                    media = OpticalMedia(
                        device_id=device_id,
                        present=False,
                        toc=None,
                        cd_text=None,
                    )
                sig = media_signature(media)
                if sig != last_sig:
                    last_sig = sig
                    await broadcast(
                        p.envelope(p.MSG_OPTICAL_MEDIA, **media.to_dict())
                    )
                await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            return

    async def read(
        self,
        sess: Any,
        msg: dict[str, Any],
        *,
        live: LiveFn,
        broadcast: BroadcastFn,
    ) -> None:
        device_id = device_id_from(msg)
        if not device_id:
            raise ValueError("deviceId required")
        media = await asyncio.to_thread(self.port.read, device_id)
        self._last_device = device_id
        if not await live(sess):
            return
        await broadcast(p.envelope(p.MSG_OPTICAL_MEDIA, **media.to_dict()))

    async def eject(
        self,
        sess: Any,
        msg: dict[str, Any],
        *,
        send: SendFn,
        broadcast: BroadcastFn,
    ) -> None:
        device_id = device_id_from(msg)
        if not device_id:
            raise ValueError("deviceId required")
        try:
            await asyncio.to_thread(self.port.eject, device_id)
        except OpticalError as exc:
            await send(
                sess,
                p.envelope(p.MSG_OPTICAL_ERROR, message=exc.message, code=exc.code),
            )
            return
        self.drop_reader()
        gone = OpticalMedia(
            device_id=device_id, present=False, toc=None, cd_text=None
        )
        await broadcast(p.envelope(p.MSG_OPTICAL_MEDIA, **gone.to_dict()))
