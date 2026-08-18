"""Classify lossy source encoding mode (CBR / VBR / ABR) at scan time."""

from __future__ import annotations

from pathlib import Path

from mutagen.mp3 import BitrateMode

CBR = "cbr"
VBR = "vbr"
ABR = "abr"

_AUDIO_SAMPLE_ENTRY_HEADER = 28
_STSD_PREFIX = 8  # FullBox version/flags + entry_count
_ESDS_FULLBOX = 4
_ES_DESCR_TAG = 0x03
_DECODER_CONFIG_TAG = 0x04
_DECODER_CONFIG_MIN = 13  # objectType + streamType + bufferSizeDB + max + avg


def mode_from_mp3_info(info: object) -> str | None:
    """Map mutagen ``MPEGInfo.bitrate_mode`` to ``cbr`` / ``vbr`` / ``abr``."""
    raw = getattr(info, "bitrate_mode", None)
    if raw is None:
        return None
    if raw == BitrateMode.CBR:
        return CBR
    if raw == BitrateMode.VBR:
        return VBR
    if raw == BitrateMode.ABR:
        return ABR
    return None


def mode_from_esds_bitrates(
    max_bps: int | None,
    avg_bps: int | None,
) -> str | None:
    """Classify AAC-in-m4a from DecoderConfigDescriptor max vs average bitrate."""
    if max_bps is None or avg_bps is None:
        return None
    if max_bps <= 0 or avg_bps <= 0:
        return None
    if max_bps > avg_bps:
        return VBR
    if max_bps == avg_bps:
        return CBR
    return None


def lossy_bitrate_mode(
    *,
    source_codec: str | None,
    info: object,
    path: Path,
) -> str | None:
    """Return persistable mode for MP3 / AAC-in-m4a; otherwise None."""
    codec = (source_codec or "").lower()
    if codec == "mp3":
        return mode_from_mp3_info(info)
    if codec == "aac":
        max_bps, avg_bps = read_mp4_esds_bitrates(path)
        return mode_from_esds_bitrates(max_bps, avg_bps)
    return None


def read_mp4_esds_bitrates(path: Path) -> tuple[int | None, int | None]:
    """
    Walk ``moov/trak/mdia/minf/stbl/stsd`` → first ``mp4a`` → ``esds`` and
    return DecoderConfigDescriptor ``(maxBitrate, avgBitrate)``.
    """
    try:
        data = path.read_bytes()
    except OSError:
        return None, None
    try:
        return _esds_bitrates_from_bytes(data)
    except (OSError, ValueError, IndexError):
        return None, None


def _esds_bitrates_from_bytes(data: bytes) -> tuple[int | None, int | None]:
    stsd = _find_box_path(
        data,
        0,
        len(data),
        (b"moov", b"trak", b"mdia", b"minf", b"stbl", b"stsd"),
    )
    if stsd is None:
        return None, None
    payload_start, payload_end = stsd
    entries_at = payload_start + _STSD_PREFIX
    if entries_at > payload_end:
        return None, None
    for typ, header_end, box_end in _iter_boxes(data, entries_at, payload_end):
        if typ != b"mp4a":
            continue
        children_at = header_end + _AUDIO_SAMPLE_ENTRY_HEADER
        if children_at > box_end:
            return None, None
        for child_typ, child_start, child_end in _iter_boxes(
            data, children_at, box_end
        ):
            if child_typ != b"esds":
                continue
            return _bitrates_from_esds(data, child_start, child_end)
        return None, None
    return None, None


def _bitrates_from_esds(
    data: bytes,
    start: int,
    end: int,
) -> tuple[int | None, int | None]:
    body_start = start + _ESDS_FULLBOX
    if body_start > end:
        return None, None
    for tag, desc_start, desc_end in _iter_descriptors(data, body_start, end):
        if tag != _ES_DESCR_TAG:
            continue
        nested_at = _skip_es_descriptor_header(data, desc_start, desc_end)
        if nested_at is None:
            return None, None
        for nested_tag, cfg_start, cfg_end in _iter_descriptors(
            data, nested_at, desc_end
        ):
            if nested_tag != _DECODER_CONFIG_TAG:
                continue
            return _bitrates_from_decoder_config(data, cfg_start, cfg_end)
        return None, None
    return None, None


def _skip_es_descriptor_header(
    data: bytes,
    start: int,
    end: int,
) -> int | None:
    """Skip ES_ID + flags (+ optional dependsOn / URL / OCR) per ISO 14496-1."""
    if start + 3 > end:
        return None
    flags = data[start + 2]
    offset = start + 3
    if flags & 0x80:
        offset += 2
    if flags & 0x40:
        if offset >= end:
            return None
        url_len = data[offset]
        offset += 1 + url_len
    if flags & 0x20:
        offset += 2
    if offset > end:
        return None
    return offset


def _bitrates_from_decoder_config(
    data: bytes,
    start: int,
    end: int,
) -> tuple[int | None, int | None]:
    if end - start < _DECODER_CONFIG_MIN:
        return None, None
    max_bps = int.from_bytes(data[start + 5 : start + 9], "big")
    avg_bps = int.from_bytes(data[start + 9 : start + 13], "big")
    return max_bps, avg_bps


def _find_box_path(
    data: bytes,
    start: int,
    end: int,
    path: tuple[bytes, ...],
) -> tuple[int, int] | None:
    if not path:
        return start, end
    want, *rest = path
    for typ, header_end, box_end in _iter_boxes(data, start, end):
        if typ != want:
            continue
        if not rest:
            return header_end, box_end
        found = _find_box_path(data, header_end, box_end, tuple(rest))
        if found is not None:
            return found
    return None


def _iter_boxes(data: bytes, start: int, end: int):
    offset = start
    while offset < end:
        parsed = _read_box_header(data, offset, end)
        if parsed is None:
            return
        header_end, typ, box_end = parsed
        yield typ, header_end, box_end
        if box_end <= offset:
            return
        offset = box_end


def _read_box_header(
    data: bytes,
    offset: int,
    end: int,
) -> tuple[int, bytes, int] | None:
    if offset + 8 > end:
        return None
    size = int.from_bytes(data[offset : offset + 4], "big")
    typ = data[offset + 4 : offset + 8]
    header_end = offset + 8
    if size == 1:
        if offset + 16 > end:
            return None
        size = int.from_bytes(data[offset + 8 : offset + 16], "big")
        header_end = offset + 16
        box_end = offset + size
    elif size == 0:
        box_end = end
    else:
        box_end = offset + size
    if box_end > end or box_end < header_end:
        return None
    return header_end, typ, box_end


def _iter_descriptors(data: bytes, start: int, end: int):
    offset = start
    while offset < end:
        tag = data[offset]
        sized = _read_expandable_size(data, offset + 1, end)
        if sized is None:
            return
        size, body_start = sized
        body_end = body_start + size
        if body_end > end:
            return
        yield tag, body_start, body_end
        offset = body_end


def _read_expandable_size(
    data: bytes,
    offset: int,
    end: int,
) -> tuple[int, int] | None:
    size = 0
    for _ in range(4):
        if offset >= end:
            return None
        byte = data[offset]
        offset += 1
        size = (size << 7) | (byte & 0x7F)
        if (byte & 0x80) == 0:
            return size, offset
    return None
