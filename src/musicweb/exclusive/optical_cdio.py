"""Darwin libcdio bindings for the companion optical port.

Missing libcdio is a soft failure: list is empty and callers get an install
hint. ctypes is isolated here so tests can inject a fake library.
"""

from __future__ import annotations

import ctypes
import logging
from pathlib import Path
from typing import Any, Protocol

from musicweb.exclusive.cdda_stream import CddaReader, ParanoiaSource, SectorSource
from musicweb.exclusive.optical import (
    LIBCDIO_INSTALL_HINT,
    CdText,
    DiscToc,
    OpticalDrive,
    OpticalError,
    OpticalMedia,
    toc_track_extent,
)

logger = logging.getLogger(__name__)

DRIVER_UNKNOWN = 0
DRIVER_OSX = 5
DRIVER_DEVICE = 10
TRACK_FORMAT_AUDIO = 0
CDIO_INVALID_LSN = -45301
CDIO_INVALID_TRACK = 0xFF
CDIO_CDROM_LEADOUT_TRACK = 0xAA
CDTEXT_FIELD_TITLE = 0
CDTEXT_FIELD_PERFORMER = 1
DRIVER_OP_SUCCESS = 0

_LIB_NAMES = ("libcdio.21.dylib", "libcdio.dylib")
_LIB_DIRS = (Path("/opt/homebrew/lib"), Path("/usr/local/lib"))


class _HwInfo(ctypes.Structure):
    _fields_ = [
        ("psz_vendor", ctypes.c_char * 9),
        ("psz_model", ctypes.c_char * 17),
        ("psz_revision", ctypes.c_char * 5),
    ]


class CdioApi(Protocol):
    def list_device_paths(self) -> list[str]: ...

    def open(self, device_id: str) -> Any: ...

    def destroy(self, handle: Any) -> None: ...

    def hwinfo_name(self, handle: Any) -> str | None: ...

    def first_track(self, handle: Any) -> int: ...

    def last_track(self, handle: Any) -> int: ...

    def track_format(self, handle: Any, track: int) -> int: ...

    def track_lsn(self, handle: Any, track: int) -> int: ...

    def cdtext_handle(self, handle: Any) -> Any | None: ...

    def cdtext_field(self, cdtext: Any, field: int, track: int) -> str | None: ...

    def eject(self, device_id: str) -> None: ...


def find_libcdio_path() -> Path | None:
    for directory in _LIB_DIRS:
        for name in _LIB_NAMES:
            path = directory / name
            if path.is_file():
                return path
    return None


def load_libcdio() -> ctypes.CDLL | None:
    path = find_libcdio_path()
    candidates: list[str] = []
    if path is not None:
        candidates.append(str(path))
    candidates.extend(_LIB_NAMES)
    for name in candidates:
        try:
            return ctypes.CDLL(name)
        except OSError:
            continue
    return None


def _decode_c_string(value: bytes | None) -> str | None:
    if not value:
        return None
    text = value.decode("utf-8", errors="replace").strip()
    return text or None


def _walk_string_list(ptr: Any) -> list[str]:
    if not ptr:
        return []
    out: list[str] = []
    index = 0
    while True:
        raw = ptr[index]
        if not raw:
            break
        out.append(raw.decode("utf-8", errors="replace"))
        index += 1
    return out


class CtypesCdio:
    """Real libcdio via ctypes."""

    def __init__(self, dll: ctypes.CDLL) -> None:
        self._dll = dll
        self._bind()

    def _bind(self) -> None:
        dll = self._dll
        dll.cdio_get_devices.restype = ctypes.POINTER(ctypes.c_char_p)
        dll.cdio_get_devices.argtypes = [ctypes.c_uint]
        if hasattr(dll, "cdio_get_devices_osx"):
            dll.cdio_get_devices_osx.restype = ctypes.POINTER(ctypes.c_char_p)
            dll.cdio_get_devices_osx.argtypes = []
        dll.cdio_free_device_list.restype = None
        dll.cdio_free_device_list.argtypes = [ctypes.POINTER(ctypes.c_char_p)]
        dll.cdio_open.restype = ctypes.c_void_p
        dll.cdio_open.argtypes = [ctypes.c_char_p, ctypes.c_uint]
        dll.cdio_destroy.restype = None
        dll.cdio_destroy.argtypes = [ctypes.c_void_p]
        dll.cdio_get_hwinfo.restype = ctypes.c_bool
        dll.cdio_get_hwinfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(_HwInfo)]
        dll.cdio_get_first_track_num.restype = ctypes.c_uint8
        dll.cdio_get_first_track_num.argtypes = [ctypes.c_void_p]
        dll.cdio_get_last_track_num.restype = ctypes.c_uint8
        dll.cdio_get_last_track_num.argtypes = [ctypes.c_void_p]
        dll.cdio_get_track_format.restype = ctypes.c_int
        dll.cdio_get_track_format.argtypes = [ctypes.c_void_p, ctypes.c_uint8]
        dll.cdio_get_track_lsn.restype = ctypes.c_int32
        dll.cdio_get_track_lsn.argtypes = [ctypes.c_void_p, ctypes.c_uint8]
        dll.cdio_get_cdtext.restype = ctypes.c_void_p
        dll.cdio_get_cdtext.argtypes = [ctypes.c_void_p]
        dll.cdtext_get_const.restype = ctypes.c_char_p
        dll.cdtext_get_const.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_uint8,
        ]
        dll.cdio_eject_media_drive.restype = ctypes.c_int
        dll.cdio_eject_media_drive.argtypes = [ctypes.c_char_p]

    def list_device_paths(self) -> list[str]:
        dll = self._dll
        ptr = None
        if hasattr(dll, "cdio_get_devices_osx"):
            ptr = dll.cdio_get_devices_osx()
        if not ptr:
            ptr = dll.cdio_get_devices(DRIVER_DEVICE)
        try:
            return _walk_string_list(ptr)
        finally:
            if ptr:
                dll.cdio_free_device_list(ptr)

    def open(self, device_id: str) -> Any:
        return self._dll.cdio_open(device_id.encode("utf-8"), DRIVER_UNKNOWN)

    def destroy(self, handle: Any) -> None:
        if handle:
            self._dll.cdio_destroy(handle)

    def hwinfo_name(self, handle: Any) -> str | None:
        info = _HwInfo()
        if not self._dll.cdio_get_hwinfo(handle, ctypes.byref(info)):
            return None
        vendor = _decode_c_string(info.psz_vendor) or ""
        model = _decode_c_string(info.psz_model) or ""
        name = f"{vendor} {model}".strip()
        return name or None

    def first_track(self, handle: Any) -> int:
        return int(self._dll.cdio_get_first_track_num(handle))

    def last_track(self, handle: Any) -> int:
        return int(self._dll.cdio_get_last_track_num(handle))

    def track_format(self, handle: Any, track: int) -> int:
        return int(self._dll.cdio_get_track_format(handle, track))

    def track_lsn(self, handle: Any, track: int) -> int:
        return int(self._dll.cdio_get_track_lsn(handle, track))

    def cdtext_handle(self, handle: Any) -> Any | None:
        return self._dll.cdio_get_cdtext(handle) or None

    def cdtext_field(self, cdtext: Any, field: int, track: int) -> str | None:
        raw = self._dll.cdtext_get_const(cdtext, field, track)
        return _decode_c_string(raw)

    def eject(self, device_id: str) -> None:
        rc = self._dll.cdio_eject_media_drive(device_id.encode("utf-8"))
        if rc != DRIVER_OP_SUCCESS:
            raise OpticalError("eject failed", code="eject")


def audio_toc_from_tracks(
    first: int,
    last: int,
    formats: dict[int, int],
    lsns: dict[int, int],
    leadout_lsn: int,
) -> DiscToc | None:
    """Keep the Red Book audio session; drop a trailing data track."""
    if first <= 0 or last < first or last >= CDIO_INVALID_TRACK:
        return None
    audio: list[int] = []
    for track in range(first, last + 1):
        if formats.get(track, TRACK_FORMAT_AUDIO) == TRACK_FORMAT_AUDIO:
            audio.append(track)
        elif audio:
            # Trailing data session (Enhanced/CD-Extra). Lead-out is this LSN.
            data_lsn = lsns.get(track, CDIO_INVALID_LSN)
            if data_lsn != CDIO_INVALID_LSN:
                leadout_lsn = data_lsn
            break
        else:
            return None
    if not audio:
        return None
    offsets: list[int] = []
    for track in audio:
        lsn = lsns.get(track, CDIO_INVALID_LSN)
        if lsn == CDIO_INVALID_LSN:
            return None
        offsets.append(lsn)
    if leadout_lsn == CDIO_INVALID_LSN:
        return None
    return DiscToc(
        first_track=audio[0],
        last_audio_track=audio[-1],
        leadout_lba=leadout_lsn,
        offsets=offsets,
    )


class DarwinOpticalPort:
    def __init__(
        self,
        lib: CdioApi | None = None,
        *,
        sector_source: SectorSource | None = None,
    ) -> None:
        self._last: OpticalMedia | None = None
        self._reader: CddaReader | None = None
        self._sector_source = sector_source
        if lib is not None:
            self._lib: CdioApi | None = lib
            self._missing = False
            return
        dll = load_libcdio()
        if dll is None:
            self._lib = None
            self._missing = True
            logger.info("libcdio not found; optical list is empty")
            return
        try:
            self._lib = CtypesCdio(dll)
            self._missing = False
        except Exception:
            logger.exception("libcdio bind failed")
            self._lib = None
            self._missing = True

    def missing_lib_hint(self) -> str | None:
        if self._missing:
            return LIBCDIO_INSTALL_HINT
        return None

    def list_drives(self) -> list[OpticalDrive]:
        if self._lib is None:
            return []
        try:
            paths = self._lib.list_device_paths()
        except Exception:
            logger.exception("optical list failed")
            return []
        drives: list[OpticalDrive] = []
        for path in paths:
            name = self._name_for(path) or path
            drives.append(OpticalDrive(id=path, name=name))
        return drives

    def read(self, device_id: str) -> OpticalMedia:
        empty = OpticalMedia(
            device_id=device_id, present=False, toc=None, cd_text=None
        )
        if self._lib is None or not device_id:
            self._last = empty
            return empty
        handle = self._lib.open(device_id)
        if not handle:
            self._last = empty
            return empty
        try:
            toc = self._read_toc(handle)
            if toc is None:
                self._last = empty
                return empty
            media = OpticalMedia(
                device_id=device_id,
                present=True,
                toc=toc,
                cd_text=self._read_cd_text(handle, toc),
            )
            self._last = media
            return media
        except Exception:
            logger.exception("optical read failed")
            self._last = empty
            return empty
        finally:
            self._lib.destroy(handle)

    def last_media(self) -> OpticalMedia | None:
        return self._last

    def drop_reader(self) -> None:
        reader = self._reader
        self._reader = None
        if reader is not None:
            reader.close()

    def open_track(self, device_id: str, track_no: int) -> CddaReader | None:
        media = self._last
        if (
            media is None
            or media.device_id != device_id
            or not media.present
            or media.toc is None
        ):
            return None
        extent = toc_track_extent(media.toc, track_no)
        if extent is None:
            return None
        first_lsn, sector_count = extent
        live = self._reader
        if (
            live is not None
            and not live.closed
            and live.device_id == device_id
            and live.track_no == track_no
        ):
            return live
        source = self._sector_source
        if source is None:
            try:
                source = ParanoiaSource(device_id)
            except Exception:
                logger.info("paranoia source unavailable")
                return None
        self.drop_reader()
        reader = CddaReader(
            first_lsn=first_lsn, sector_count=sector_count, source=source
        )
        reader.device_id = device_id
        reader.track_no = track_no
        self._reader = reader
        return reader

    def eject(self, device_id: str) -> None:
        if self._lib is None:
            raise OpticalError(LIBCDIO_INSTALL_HINT, code="libcdio_missing")
        if not device_id:
            raise OpticalError("deviceId required", code="device")
        self._lib.eject(device_id)

    def _name_for(self, device_id: str) -> str | None:
        assert self._lib is not None
        handle = self._lib.open(device_id)
        if not handle:
            return None
        try:
            return self._lib.hwinfo_name(handle)
        except Exception:
            return None
        finally:
            self._lib.destroy(handle)

    def _read_toc(self, handle: Any) -> DiscToc | None:
        assert self._lib is not None
        first = self._lib.first_track(handle)
        last = self._lib.last_track(handle)
        formats: dict[int, int] = {}
        lsns: dict[int, int] = {}
        if first != CDIO_INVALID_TRACK and last != CDIO_INVALID_TRACK:
            for track in range(first, last + 1):
                formats[track] = self._lib.track_format(handle, track)
                lsns[track] = self._lib.track_lsn(handle, track)
        leadout = self._lib.track_lsn(handle, CDIO_CDROM_LEADOUT_TRACK)
        return audio_toc_from_tracks(first, last, formats, lsns, leadout)

    def _read_cd_text(self, handle: Any, toc: DiscToc) -> CdText | None:
        assert self._lib is not None
        cdtext = self._lib.cdtext_handle(handle)
        if not cdtext:
            return None
        album = self._lib.cdtext_field(cdtext, CDTEXT_FIELD_TITLE, 0)
        artist = self._lib.cdtext_field(cdtext, CDTEXT_FIELD_PERFORMER, 0)
        titles: list[str] = []
        any_title = False
        for track in range(toc.first_track, toc.last_audio_track + 1):
            title = self._lib.cdtext_field(cdtext, CDTEXT_FIELD_TITLE, track)
            if title:
                any_title = True
            titles.append(title or "")
        if album is None and artist is None and not any_title:
            return None
        return CdText(album=album, artist=artist, tracks=titles)
