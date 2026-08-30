"""Optical drive port for the Desktop companion.

macOS uses libcdio (see ``optical_cdio``). Other platforms return an empty
list and reject watch/read/eject. The companion still starts without libcdio.
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from typing import Any, Protocol

from musicweb.exclusive.cdda_stream import CddaReader, track_extent as _track_extent

logger = logging.getLogger(__name__)

LIBCDIO_INSTALL_HINT = "Install libcdio: brew install libcdio libcdio-paranoia"
LIBCDIO_PARANOIA_HINT = (
    "Install libcdio-paranoia: brew install libcdio libcdio-paranoia"
)
UNSUPPORTED_HINT = "Optical drives are not supported on this platform"


@dataclass(frozen=True)
class OpticalDrive:
    id: str
    name: str
    key: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "key": self.key}


@dataclass(frozen=True)
class DiscToc:
    first_track: int
    last_audio_track: int
    leadout_lba: int
    offsets: list[int]

    def to_dict(self) -> dict[str, Any]:
        return {
            "first_track": self.first_track,
            "last_audio_track": self.last_audio_track,
            "leadout_lba": self.leadout_lba,
            "offsets": list(self.offsets),
        }


@dataclass(frozen=True)
class CdText:
    album: str | None
    artist: str | None
    tracks: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "album": self.album,
            "artist": self.artist,
            "tracks": list(self.tracks),
        }


@dataclass(frozen=True)
class OpticalMedia:
    device_id: str
    present: bool
    toc: DiscToc | None
    cd_text: CdText | None
    kind: str = "none"

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "present": self.present,
            "toc": self.toc.to_dict() if self.toc else None,
            "cd_text": self.cd_text.to_dict() if self.cd_text else None,
            "kind": self.kind,
        }


class OpticalError(Exception):
    def __init__(self, message: str, *, code: str = "optical") -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class OpticalPort(Protocol):
    def list_drives(self) -> list[OpticalDrive]: ...

    def read(self, device_id: str) -> OpticalMedia: ...

    def eject(self, device_id: str) -> None: ...

    def missing_lib_hint(self) -> str | None: ...

    def last_media(self) -> OpticalMedia | None: ...

    def open_track(self, device_id: str, track_no: int) -> CddaReader | None: ...

    def drop_reader(self) -> None: ...

    def live_reader_device(self) -> str | None: ...


class StubOpticalPort:
    """Windows/Linux (and tests): no devices, eject is a safe error."""

    def __init__(self) -> None:
        self._last: OpticalMedia | None = None

    def list_drives(self) -> list[OpticalDrive]:
        return []

    def read(self, device_id: str) -> OpticalMedia:
        media = OpticalMedia(
            device_id=device_id,
            present=False,
            toc=None,
            cd_text=None,
            kind="none",
        )
        self._last = media
        return media

    def eject(self, device_id: str) -> None:
        raise OpticalError(UNSUPPORTED_HINT, code="unsupported")

    def missing_lib_hint(self) -> str | None:
        return None

    def last_media(self) -> OpticalMedia | None:
        return self._last

    def open_track(self, device_id: str, track_no: int) -> CddaReader | None:
        return None

    def drop_reader(self) -> None:
        return None

    def live_reader_device(self) -> str | None:
        return None


def toc_track_extent(toc: DiscToc, track_no: int) -> tuple[int, int] | None:
    return _track_extent(
        toc.first_track,
        toc.last_audio_track,
        toc.offsets,
        toc.leadout_lba,
        track_no,
    )


def get_optical_port() -> OpticalPort:
    if sys.platform == "darwin":
        from musicweb.exclusive.optical_cdio import DarwinOpticalPort

        return DarwinOpticalPort()
    return StubOpticalPort()


def media_signature(media: OpticalMedia) -> tuple[Any, ...]:
    """Compare present-edge + TOC (+ CD-Text) without device path logging."""
    toc = media.toc
    text = media.cd_text
    return (
        media.present,
        media.kind,
        None
        if toc is None
        else (
            toc.first_track,
            toc.last_audio_track,
            toc.leadout_lba,
            tuple(toc.offsets),
        ),
        None
        if text is None
        else (text.album, text.artist, tuple(text.tracks)),
    )
