"""Live virtual WAV: Red Book sectors as a Range-addressable PCM file.

No track file on disk. A RAM ring of ~6 s (450 sectors) is the only buffer.
"""

from __future__ import annotations

import ctypes
import logging
import struct
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

logger = logging.getLogger(__name__)

HEADER_BYTES = 44
SECTOR_BYTES = 2352
SAMPLE_RATE_HZ = 44100
CHANNELS = 2
BITS_PER_SAMPLE = 16
RING_SECTORS = 450  # 6 s at 75 sectors/s
PARANOIA_MODE_VERIFY = 0x01
PARANOIA_MODE_OVERLAP = 0x04
SEEK_SET = 0


def wav_header(data_bytes: int) -> bytes:
    if data_bytes < 0:
        raise ValueError("data_bytes must be >= 0")
    riff_size = 36 + data_bytes
    return struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        riff_size,
        b"WAVE",
        b"fmt ",
        16,
        1,
        CHANNELS,
        SAMPLE_RATE_HZ,
        SAMPLE_RATE_HZ * CHANNELS * (BITS_PER_SAMPLE // 8),
        CHANNELS * (BITS_PER_SAMPLE // 8),
        BITS_PER_SAMPLE,
        b"data",
        data_bytes,
    )


def content_length(sector_count: int) -> int:
    if sector_count < 0:
        raise ValueError("sector_count must be >= 0")
    return HEADER_BYTES + sector_count * SECTOR_BYTES


def range_to_sectors(
    start: int,
    end: int,
    first_lsn: int,
    sector_count: int,
) -> tuple[int, int, int, int, int]:
    """Map inclusive byte range to header + PCM slice.

    Returns ``(header_from, header_to, first_index, last_index, pcm_offset)``.
    ``header_to`` is exclusive. Sector indexes are 0-based in the track.
    ``pcm_offset`` is the start byte inside the first returned sector.
    Empty PCM is ``first_index > last_index``.
    """
    size = content_length(sector_count)
    if start < 0 or end < start:
        raise ValueError("unsatisfiable")
    if start >= size:
        raise ValueError("unsatisfiable")
    end = min(end, size - 1)
    if start < HEADER_BYTES:
        header_from = start
        header_to = min(end, HEADER_BYTES - 1) + 1
    else:
        header_from = 0
        header_to = 0
    if end < HEADER_BYTES:
        return header_from, header_to, 1, 0, 0
    pcm_start = max(start, HEADER_BYTES) - HEADER_BYTES
    pcm_end = end - HEADER_BYTES
    first_index = pcm_start // SECTOR_BYTES
    last_index = pcm_end // SECTOR_BYTES
    if last_index >= sector_count:
        last_index = sector_count - 1
    pcm_offset = pcm_start % SECTOR_BYTES
    return header_from, header_to, first_index, last_index, pcm_offset


class SectorSource(Protocol):
    def read_sector(self, lsn: int) -> bytes: ...

    def close(self) -> None: ...


class MemorySectorSource:
    """Test double: sector bytes from a callback or silence."""

    def __init__(self, fill: Callable[[int], bytes] | None = None) -> None:
        self._fill = fill
        self.reads: list[int] = []

    def read_sector(self, lsn: int) -> bytes:
        self.reads.append(lsn)
        if self._fill is not None:
            data = self._fill(lsn)
        else:
            data = bytes((lsn + i) % 256 for i in range(SECTOR_BYTES))
        if len(data) != SECTOR_BYTES:
            raise ValueError("sector must be 2352 bytes")
        return data

    def close(self) -> None:
        return None


class CddaReader:
    """Overlap+verify paranoia (or a test source) with a 6 s RAM ring."""

    def __init__(
        self,
        *,
        first_lsn: int,
        sector_count: int,
        source: SectorSource,
    ) -> None:
        if sector_count <= 0:
            raise ValueError("sector_count must be > 0")
        self.first_lsn = first_lsn
        self.sector_count = sector_count
        self.device_id = ""
        self.track_no = 0
        self._source = source
        self._lock = threading.Lock()
        self._ring_start = -1
        self._ring: list[bytes] = []
        self._closed = False
        self._generation = 0

    @property
    def closed(self) -> bool:
        return self._closed

    def close(self) -> None:
        with self._lock:
            self._closed = True
            self._generation += 1
            self._ring = []
            self._ring_start = -1
            self._source.close()

    def cancel_in_flight(self) -> int:
        with self._lock:
            self._generation += 1
            return self._generation

    def iter_span(self, start: int, end: int):
        header_from, header_to, first_idx, last_idx, pcm_offset = range_to_sectors(
            start, end, self.first_lsn, self.sector_count
        )
        header = wav_header(self.sector_count * SECTOR_BYTES)
        if header_to > header_from:
            yield header[header_from:header_to]
        if first_idx > last_idx:
            return
        with self._lock:
            if self._ring_get(first_idx) is None and self._ring_start >= 0:
                self._generation += 1
        size = content_length(self.sector_count)
        end_c = min(end, size - 1)
        pcm_start = max(start, HEADER_BYTES) - HEADER_BYTES
        pcm_len = (end_c - HEADER_BYTES) - pcm_start + 1
        emitted = 0
        for index in range(first_idx, last_idx + 1):
            if emitted >= pcm_len:
                break
            sector = self._sector_at(index)
            if index == first_idx:
                sector = sector[pcm_offset:]
            piece = sector[: pcm_len - emitted]
            emitted += len(piece)
            if piece:
                yield piece

    def read_span(self, start: int, end: int) -> bytes:
        return b"".join(self.iter_span(start, end))

    def _sector_at(self, index: int) -> bytes:
        with self._lock:
            if self._closed:
                raise RuntimeError("reader closed")
            cached = self._ring_get(index)
            if cached is not None:
                return cached
            gen = self._generation
        self._prime(index, gen)
        with self._lock:
            if self._closed or gen != self._generation:
                raise RuntimeError("reader cancelled")
            cached = self._ring_get(index)
            if cached is None:
                raise RuntimeError("sector read failed")
            return cached

    def _ring_get(self, index: int) -> bytes | None:
        if self._ring_start < 0:
            return None
        offset = index - self._ring_start
        if 0 <= offset < len(self._ring):
            return self._ring[offset]
        return None

    def _prime(self, index: int, gen: int) -> None:
        """Fill the ring starting at *index*. Sector I/O is outside the lock."""
        with self._lock:
            if self._closed or gen != self._generation:
                raise RuntimeError("reader cancelled")
            if self._ring_get(index) is not None:
                return
            self._ring = []
            self._ring_start = -1
        want = min(RING_SECTORS, self.sector_count - index)
        filled: list[bytes] = []
        for step in range(want):
            with self._lock:
                if self._closed or gen != self._generation:
                    raise RuntimeError("reader cancelled")
            filled.append(self._source.read_sector(self.first_lsn + index + step))
        with self._lock:
            if self._closed or gen != self._generation:
                raise RuntimeError("reader cancelled")
            self._ring_start = index
            self._ring = filled


def _load_dylib(names: tuple[str, ...], directories: tuple[Path, ...]) -> ctypes.CDLL | None:
    candidates: list[str] = []
    for directory in directories:
        for name in names:
            path = directory / name
            if path.is_file():
                candidates.append(str(path))
    candidates.extend(names)
    for name in candidates:
        try:
            return ctypes.CDLL(name)
        except OSError:
            continue
    return None


class ParanoiaSource:
    """libcdio-paranoia sector reader. Optional; missing libs leave CD 404."""

    _LIB_DIRS = (Path("/opt/homebrew/lib"), Path("/usr/local/lib"))

    def __init__(self, device_id: str) -> None:
        self._device_id = device_id
        self._cursor: int | None = None
        self._test_seek: Callable[[int], None] | None = None
        self._test_read: Callable[[int], bytes] | None = None
        self._cdda = _load_dylib(
            ("libcdio_cdda.2.dylib", "libcdio_cdda.dylib"), self._LIB_DIRS
        )
        self._para_lib = _load_dylib(
            ("libcdio_paranoia.2.dylib", "libcdio_paranoia.dylib"),
            self._LIB_DIRS,
        )
        if self._cdda is None or self._para_lib is None:
            raise OSError("libcdio-paranoia not found")
        self._bind()
        self._drive = self._cdda.cdio_cddap_identify(
            device_id.encode("utf-8"), 1, None
        )
        if not self._drive:
            raise OSError("cdda identify failed")
        if self._cdda.cdio_cddap_open(self._drive) != 0:
            self._cdda.cdio_cddap_close(self._drive)
            self._drive = None
            raise OSError("cdda open failed")
        try:
            self._cdda.cdio_cddap_speed_set(self._drive, 8)
        except Exception:
            pass
        self._para = self._para_lib.cdio_paranoia_init(self._drive)
        if not self._para:
            self.close()
            raise OSError("paranoia init failed")
        self._para_lib.cdio_paranoia_modeset(
            self._para, PARANOIA_MODE_OVERLAP | PARANOIA_MODE_VERIFY
        )

    @classmethod
    def test_double(
        cls,
        *,
        seek: Callable[[int], None],
        read_limited: Callable[[int], bytes],
    ) -> ParanoiaSource:
        source = object.__new__(cls)
        source._device_id = ""
        source._cursor = None
        source._test_seek = seek
        source._test_read = read_limited
        source._cdda = None
        source._para_lib = None
        source._drive = None
        source._para = object()
        return source

    def _bind(self) -> None:
        cdda = self._cdda
        assert cdda is not None
        cdda.cdio_cddap_identify.restype = ctypes.c_void_p
        cdda.cdio_cddap_identify.argtypes = [
            ctypes.c_char_p,
            ctypes.c_int,
            ctypes.c_void_p,
        ]
        cdda.cdio_cddap_open.restype = ctypes.c_int
        cdda.cdio_cddap_open.argtypes = [ctypes.c_void_p]
        cdda.cdio_cddap_close.restype = ctypes.c_int
        cdda.cdio_cddap_close.argtypes = [ctypes.c_void_p]
        cdda.cdio_cddap_speed_set.restype = ctypes.c_int
        cdda.cdio_cddap_speed_set.argtypes = [ctypes.c_void_p, ctypes.c_int]
        para = self._para_lib
        assert para is not None
        para.cdio_paranoia_init.restype = ctypes.c_void_p
        para.cdio_paranoia_init.argtypes = [ctypes.c_void_p]
        para.cdio_paranoia_free.restype = None
        para.cdio_paranoia_free.argtypes = [ctypes.c_void_p]
        para.cdio_paranoia_modeset.restype = None
        para.cdio_paranoia_modeset.argtypes = [ctypes.c_void_p, ctypes.c_int]
        para.cdio_paranoia_seek.restype = ctypes.c_int32
        para.cdio_paranoia_seek.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int32,
            ctypes.c_int,
        ]
        para.cdio_paranoia_read_limited.restype = ctypes.POINTER(ctypes.c_int16)
        para.cdio_paranoia_read_limited.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_int,
        ]

    def read_sector(self, lsn: int) -> bytes:
        lsn = int(lsn)
        if self._para is None:
            return b"\x00" * SECTOR_BYTES
        if self._cursor != lsn:
            self._seek(lsn)
        data = self._read_limited(lsn)
        if data:
            self._cursor = lsn + 1
        return data or (b"\x00" * SECTOR_BYTES)

    def _seek(self, lsn: int) -> None:
        if self._test_seek is not None:
            self._test_seek(lsn)
            return
        assert self._para_lib is not None
        self._para_lib.cdio_paranoia_seek(self._para, lsn, SEEK_SET)

    def _read_limited(self, lsn: int) -> bytes:
        if self._test_read is not None:
            return self._test_read(lsn)
        assert self._para_lib is not None
        ptr = self._para_lib.cdio_paranoia_read_limited(self._para, None, 3)
        if not ptr:
            return b""
        return ctypes.string_at(ptr, SECTOR_BYTES)

    def close(self) -> None:
        if self._para is not None and self._para_lib is not None:
            try:
                self._para_lib.cdio_paranoia_free(self._para)
            except Exception:
                pass
            self._para = None
        if self._drive is not None and self._cdda is not None:
            try:
                self._cdda.cdio_cddap_close(self._drive)
            except Exception:
                pass
            self._drive = None


def track_extent(first_track: int, last_audio: int, offsets: list[int], leadout: int, track_no: int) -> tuple[int, int] | None:
    """Return ``(first_lsn, sector_count)`` for a Red Book track number."""
    if track_no < first_track or track_no > last_audio:
        return None
    index = track_no - first_track
    if index < 0 or index >= len(offsets):
        return None
    first_lsn = offsets[index]
    if track_no == last_audio:
        last_lsn = leadout - 1
    else:
        last_lsn = offsets[index + 1] - 1
    count = last_lsn - first_lsn + 1
    if count <= 0:
        return None
    return first_lsn, count
