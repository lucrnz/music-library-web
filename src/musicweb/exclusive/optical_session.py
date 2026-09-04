"""Optical watch, list/read/eject, and CDDA open-gate for the companion."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from musicweb.exclusive import protocol as p
from musicweb.exclusive.optical import (
    OpticalError,
    OpticalMedia,
    OpticalPort,
    get_optical_port,
    media_signature,
)
from musicweb.exclusive.optical_fs import CdromIndex, jail_join, walk_volume
from musicweb.exclusive.optical_meta import apply_file_meta, cover_bytes, enrich_file, local_lyrics
from musicweb.exclusive.optical_volume import (
    DarwinDiskutilSource,
    VolumeInfoSource,
    VolumeMount,
    resolve_darwin_mount,
)

logger = logging.getLogger(__name__)

# Still-resolving log/test window. Not a give-up.
_MOUNT_PENDING_LOG_S = 30.0

BroadcastFn = Callable[[dict[str, Any]], Awaitable[None]]
SendFn = Callable[[Any, dict[str, Any]], Awaitable[None]]
LiveFn = Callable[[Any], Awaitable[bool]]


def device_id_from(msg: dict[str, Any]) -> str:
    return str(msg.get("deviceId") or msg.get("device_id") or "")


@dataclass
class _CdromCache:
    device_id: str
    mount_path: Path | None
    volume_name: str | None
    volume_id: str | None
    index: CdromIndex
    generation: int = 0
    pending_since: float | None = None
    logged_pending: bool = False


class OpticalSession:
    """Watch lifetime and tray commands. Not hog / ExclusiveHub policy."""

    def __init__(
        self,
        port: OpticalPort | None = None,
        volume_info: VolumeInfoSource | None = None,
    ) -> None:
        self.port: OpticalPort = port if port is not None else get_optical_port()
        self._volume_info = volume_info
        self._watch_task: asyncio.Task[None] | None = None
        self._watch_device: str | None = None
        self._last_device: str | None = None
        self._broadcast: BroadcastFn | None = None
        self._data_live = False
        self._cdrom: _CdromCache | None = None
        self._cdrom_gen = 0
        self._enrich_task: asyncio.Task[None] | None = None

    @property
    def watch_task(self) -> asyncio.Task[None] | None:
        return self._watch_task

    @property
    def watch_device(self) -> str | None:
        return self._watch_device

    def cancel_watch(self, *, drop: bool = True) -> None:
        task = self._watch_task
        self._watch_task = None
        self._watch_device = None
        if task is not None and not task.done():
            task.cancel()
        if drop:
            self.drop_reader()
            self._data_live = False
            self._clear_cdrom()

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
        try:
            return self.port.open_track(device_id, track_no)
        except OpticalError as exc:
            self._schedule_error(exc)
            return None

    def _schedule_error(self, exc: OpticalError) -> None:
        broadcast = self._broadcast
        if broadcast is None:
            return
        msg = p.envelope(
            p.MSG_OPTICAL_ERROR, message=exc.message, code=exc.code
        )
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(broadcast(msg))

    async def list_drives(
        self,
        sess: Any,
        *,
        send: SendFn,
        live: LiveFn,
        broadcast: BroadcastFn,
    ) -> None:
        self._broadcast = broadcast
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
        self._broadcast = broadcast
        on = bool(msg.get("on"))
        if on:
            self.cancel_watch(drop=False)
            device_id = device_id_from(msg)
            if not device_id:
                raise ValueError("deviceId required")
            self._watch_device = device_id
            self._last_device = device_id
            self._watch_task = asyncio.create_task(
                self._watch_loop(device_id, broadcast)
            )
            return
        self.cancel_watch(drop=True)

    async def _watch_loop(self, device_id: str, broadcast: BroadcastFn) -> None:
        last_sig: object = object()
        try:
            while True:
                live = self.port.live_reader_device()
                if live == device_id:
                    await asyncio.sleep(1.0)
                    continue
                send_index = False
                if self._data_live:
                    try:
                        media, send_index = await asyncio.to_thread(
                            self._poll_data_volume, device_id
                        )
                    except Exception:
                        logger.exception("optical data volume poll failed")
                        await asyncio.sleep(1.0)
                        continue
                    if media.kind != "data":
                        self._data_live = False
                else:
                    try:
                        media = await asyncio.to_thread(self.port.read, device_id)
                    except Exception:
                        logger.exception("optical watch read failed")
                        await asyncio.sleep(1.0)
                        continue
                    if media.kind == "data":
                        self._data_live = True
                        try:
                            media, send_index = await asyncio.to_thread(
                                self._on_data_classified, device_id, media
                            )
                        except Exception:
                            logger.exception("optical data classify failed")
                            self._data_live = False
                            self._clear_cdrom()
                            await asyncio.sleep(1.0)
                            continue
                    else:
                        self._clear_cdrom()
                sig = media_signature(media)
                if sig != last_sig:
                    last_sig = sig
                    await broadcast(
                        p.envelope(p.MSG_OPTICAL_MEDIA, **media.to_dict())
                    )
                    if media.kind == "data":
                        # Re-push the index on every new watch (hello / rematch).
                        # Same generation is the same walk; the client will not
                        # wipe a live queue.
                        await self._broadcast_cdrom_index(broadcast, device_id)
                        if send_index:
                            self._schedule_enrich()
                elif send_index and media.kind == "data":
                    await self._broadcast_cdrom_index(broadcast, device_id)
                    self._schedule_enrich()
                await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            return

    def _resolve_mount(self, device_id: str) -> VolumeMount | None:
        return resolve_darwin_mount(device_id, info=self._volume_info)

    def _device_still_present(self, device_id: str) -> bool | None:
        """``True`` / ``False`` / ``None`` (unknown — keep last present)."""
        src = self._volume_info
        if src is not None:
            present = getattr(src, "device_present", None)
            if callable(present):
                return present(device_id)
        return DarwinDiskutilSource().device_present(device_id)

    def _clear_cdrom(self) -> None:
        task = self._enrich_task
        self._enrich_task = None
        if task is not None and not task.done():
            task.cancel()
        self._cdrom = None

    def _empty_data_media(self, device_id: str) -> OpticalMedia:
        cache = self._cdrom
        return OpticalMedia(
            device_id=device_id,
            present=True,
            toc=None,
            cd_text=None,
            kind="data",
            volume_name=cache.volume_name if cache else None,
            volume_id=cache.volume_id if cache else None,
        )

    def _gone_media(self, device_id: str) -> OpticalMedia:
        return OpticalMedia(
            device_id=device_id,
            present=False,
            toc=None,
            cd_text=None,
            kind="none",
        )

    def _next_cdrom_generation(self) -> int:
        self._cdrom_gen += 1
        return self._cdrom_gen

    def _install_mount(self, device_id: str, mount: VolumeMount) -> None:
        try:
            index = walk_volume(mount.path)
        except Exception:
            logger.exception("optical cdrom walk failed")
            index = CdromIndex()
        self._cdrom = _CdromCache(
            device_id=device_id,
            mount_path=mount.path,
            volume_name=mount.name,
            volume_id=mount.volume_id,
            index=index,
            generation=self._next_cdrom_generation(),
        )

    def _on_data_classified(
        self, device_id: str, media: OpticalMedia
    ) -> tuple[OpticalMedia, bool]:
        """First data classify: present now, walk if the mount is already up."""
        self._cdrom = _CdromCache(
            device_id=device_id,
            mount_path=None,
            volume_name=None,
            volume_id=None,
            index=CdromIndex(),
            generation=self._next_cdrom_generation(),
            pending_since=time.monotonic(),
        )
        mount = self._resolve_mount(device_id)
        if mount is None:
            return (
                replace(media, volume_name=None, volume_id=None),
                True,
            )
        self._install_mount(device_id, mount)
        return (
            replace(media, volume_name=mount.name, volume_id=mount.volume_id),
            True,
        )

    def _poll_data_volume(self, device_id: str) -> tuple[OpticalMedia, bool]:
        """Poll mount presence + volume_id. Never TOC-opens the device."""
        mount = self._resolve_mount(device_id)
        cache = self._cdrom
        if cache is not None and cache.mount_path is not None:
            if not cache.mount_path.is_dir():
                self._clear_cdrom()
                return self._gone_media(device_id), False
            if mount is None:
                # Transient diskutil miss: keep last present (same as idle TOC).
                return self._empty_data_media(device_id), False
            if mount.volume_id != cache.volume_id:
                self._install_mount(device_id, mount)
                return self._empty_data_media(device_id), True
            return self._empty_data_media(device_id), False

        if mount is None:
            # Only a positive gone (diskutil says the BSD device is gone)
            # drops the pending face. Timeout / unknown keeps Data CD.
            if self._device_still_present(device_id) is False:
                self._clear_cdrom()
                return self._gone_media(device_id), False
            if cache is not None and cache.pending_since is not None:
                waited = time.monotonic() - cache.pending_since
                if waited >= _MOUNT_PENDING_LOG_S and not cache.logged_pending:
                    logger.info(
                        "optical data mount still resolving after %.0fs",
                        waited,
                    )
                    cache.logged_pending = True
            return self._empty_data_media(device_id), False

        self._install_mount(device_id, mount)
        return self._empty_data_media(device_id), True

    def _broadcast_cdrom_index_payload(self, device_id: str) -> dict[str, Any]:
        cache = self._cdrom
        index = cache.index if cache is not None else CdromIndex()
        return {
            "device_id": device_id,
            "volume_name": cache.volume_name if cache else None,
            "auto_add_rel": index.auto_add_rel,
            "folders": index.folder_counts(),
            "generation": cache.generation if cache else 0,
        }

    async def _broadcast_cdrom_index(
        self, broadcast: BroadcastFn, device_id: str
    ) -> None:
        await broadcast(
            p.envelope(
                p.MSG_CDROM_INDEX, **self._broadcast_cdrom_index_payload(device_id)
            )
        )

    def _schedule_enrich(self) -> None:
        broadcast = self._broadcast
        cache = self._cdrom
        if broadcast is None or cache is None or cache.mount_path is None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._enrich_task is not None and not self._enrich_task.done():
            self._enrich_task.cancel()
        self._enrich_task = loop.create_task(
            self._enrich_all(cache.device_id, cache.volume_id, broadcast)
        )

    def _enrich_folder(self, rel: str) -> None:
        cache = self._cdrom
        if cache is None or cache.mount_path is None:
            return
        _dirs, files = cache.index.list_children(rel)
        for item in files:
            path = jail_join(cache.mount_path, item.rel)
            if path is None:
                continue
            try:
                apply_file_meta(item, enrich_file(path))
            except Exception:
                logger.debug("cdrom enrich failed %s", item.rel, exc_info=True)

    async def _enrich_all(
        self,
        device_id: str,
        volume_id: str | None,
        broadcast: BroadcastFn,
    ) -> None:
        try:
            cache = self._cdrom
            if cache is None or cache.volume_id != volume_id:
                return
            folders = [str(row["rel"]) for row in cache.index.folder_counts()]
            last_rel = ""
            for rel in folders:
                if self._cdrom is None or self._cdrom.volume_id != volume_id:
                    return
                await asyncio.to_thread(self._enrich_folder, rel)
                payload = self.cdrom_list_payload(device_id, rel)
                if payload is not None:
                    await broadcast(p.envelope(p.MSG_CDROM_LIST, **payload))
                last_rel = rel
            if self._cdrom is None or self._cdrom.volume_id != volume_id:
                return
            payload = self.cdrom_list_payload(device_id, last_rel)
            if payload is not None:
                await broadcast(p.envelope(p.MSG_CDROM_LIST, **payload))
        except asyncio.CancelledError:
            return

    def cdrom_list_payload(self, device_id: str, rel: str) -> dict[str, Any] | None:
        cache = self._cdrom
        if cache is None or cache.device_id != device_id:
            return None
        if cache.mount_path is None:
            if rel not in ("", "."):
                return None
            return {
                "device_id": device_id,
                "rel": "",
                "dirs": [],
                "files": [],
            }
        joined = jail_join(cache.mount_path, rel)
        if joined is None:
            return None
        dirs, files = cache.index.list_children(rel)
        return {
            "device_id": device_id,
            "rel": rel if rel not in (".",) else "",
            "dirs": [{"name": d.name, "rel": d.rel} for d in dirs],
            "files": [f.to_list_dict() for f in files],
        }

    def resolve_cdrom_file(self, device_id: str, rel: str) -> Path | None:
        """Jail + allowlisted file from the cached walk. Stage 02 HTTP uses this."""
        cache = self._cdrom
        if cache is None or cache.device_id != device_id or cache.mount_path is None:
            return None
        if cache.index.file_by_rel(rel) is None:
            return None
        joined = jail_join(cache.mount_path, rel)
        if joined is None or not joined.is_file():
            return None
        return joined

    async def list_cdrom(
        self,
        sess: Any,
        msg: dict[str, Any],
        *,
        send: SendFn,
        live: LiveFn,
    ) -> None:
        device_id = device_id_from(msg)
        if not device_id:
            raise ValueError("deviceId required")
        rel = str(msg.get("rel") or "")
        payload = self.cdrom_list_payload(device_id, rel)
        if not await live(sess):
            return
        if payload is None:
            payload = {
                "device_id": device_id,
                "rel": rel,
                "dirs": [],
                "files": [],
            }
        await send(sess, p.envelope(p.MSG_CDROM_LIST, **payload))

    async def read(
        self,
        sess: Any,
        msg: dict[str, Any],
        *,
        live: LiveFn,
        broadcast: BroadcastFn,
    ) -> None:
        self._broadcast = broadcast
        device_id = device_id_from(msg)
        if not device_id:
            raise ValueError("deviceId required")
        cache = self._cdrom
        if (
            self._data_live
            and cache is not None
            and cache.device_id == device_id
        ):
            # Do not TOC-open a live Yellow Book volume just to refresh.
            media = self._empty_data_media(device_id)
            send_index = True
        else:
            media = await asyncio.to_thread(self.port.read, device_id)
            self._last_device = device_id
            if media.kind == "data":
                self._data_live = True
                try:
                    media, send_index = await asyncio.to_thread(
                        self._on_data_classified, device_id, media
                    )
                except Exception:
                    logger.exception("optical data classify failed")
                    self._data_live = False
                    self._clear_cdrom()
                    media = self._gone_media(device_id)
                    send_index = False
            else:
                send_index = False
                self._data_live = False
                self._clear_cdrom()
        self._last_device = device_id
        if not await live(sess):
            return
        await broadcast(p.envelope(p.MSG_OPTICAL_MEDIA, **media.to_dict()))
        if send_index:
            await self._broadcast_cdrom_index(broadcast, device_id)
            self._schedule_enrich()

    async def eject(
        self,
        sess: Any,
        msg: dict[str, Any],
        *,
        send: SendFn,
        broadcast: BroadcastFn,
    ) -> None:
        self._broadcast = broadcast
        device_id = device_id_from(msg)
        if not device_id:
            raise ValueError("deviceId required")
        self.drop_reader()
        self._data_live = False
        self._clear_cdrom()
        try:
            await asyncio.to_thread(self.port.eject, device_id)
        except OpticalError as exc:
            await send(
                sess,
                p.envelope(p.MSG_OPTICAL_ERROR, message=exc.message, code=exc.code),
            )
            return
        gone = OpticalMedia(
            device_id=device_id,
            present=False,
            toc=None,
            cd_text=None,
            kind="none",
        )
        await broadcast(p.envelope(p.MSG_OPTICAL_MEDIA, **gone.to_dict()))
