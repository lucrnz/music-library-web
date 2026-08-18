"""Lossy encoding-mode classification and ISO-shaped esds walk."""

from pathlib import Path
from types import SimpleNamespace

from mutagen.mp3 import BitrateMode

from musicweb.scan.bitrate_mode import (
    ABR,
    CBR,
    VBR,
    lossy_bitrate_mode,
    mode_from_esds_bitrates,
    mode_from_mp3_info,
    read_mp4_esds_bitrates,
)

MAX_VBR = 256_000
AVG_VBR = 128_000
CBR_BPS = 192_000


def _box(typ: bytes, payload: bytes) -> bytes:
    return (8 + len(payload)).to_bytes(4, "big") + typ + payload


def _expandable_size(n: int, *, min_bytes: int = 1) -> bytes:
    """ISO 14496-1 expandable size; ``min_bytes`` > 1 forces a continuation."""
    chunks: list[int] = []
    value = n
    while True:
        chunks.append(value & 0x7F)
        value >>= 7
        if value == 0:
            break
    chunks.reverse()
    while len(chunks) < min_bytes:
        chunks.insert(0, 0)
    for i in range(len(chunks) - 1):
        chunks[i] |= 0x80
    return bytes(chunks)


def _descriptor(tag: int, body: bytes, *, size_bytes: int = 1) -> bytes:
    return bytes([tag]) + _expandable_size(len(body), min_bytes=size_bytes) + body


def _decoder_config(max_bps: int, avg_bps: int) -> bytes:
    body = bytes(
        [
            0x40,  # objectTypeIndication (Audio ISO/IEC 14496-3)
            0x15,  # streamType AudioStream + reserved
            0x00,
            0x00,
            0x00,  # bufferSizeDB
        ]
    )
    body += max_bps.to_bytes(4, "big")
    body += avg_bps.to_bytes(4, "big")
    return _descriptor(0x04, body, size_bytes=2)


def _es_descriptor(max_bps: int, avg_bps: int) -> bytes:
    body = b"\x00\x01\x00" + _decoder_config(max_bps, avg_bps)  # ES_ID + flags
    return _descriptor(0x03, body)


def _esds(max_bps: int, avg_bps: int) -> bytes:
    return _box(b"esds", b"\x00\x00\x00\x00" + _es_descriptor(max_bps, avg_bps))


def _audio_sample_entry_header() -> bytes:
    return (
        b"\x00" * 6
        + (1).to_bytes(2, "big")
        + b"\x00" * 8
        + (2).to_bytes(2, "big")
        + (16).to_bytes(2, "big")
        + b"\x00\x00\x00\x00"
        + (44100 << 16).to_bytes(4, "big")
    )


def _stsd(mp4a_payload: bytes) -> bytes:
    mp4a = _box(b"mp4a", mp4a_payload)
    return _box(b"stsd", b"\x00\x00\x00\x00" + (1).to_bytes(4, "big") + mp4a)


def _m4a_tree(stsd: bytes) -> bytes:
    return _box(
        b"moov",
        _box(b"trak", _box(b"mdia", _box(b"minf", _box(b"stbl", stsd)))),
    )


def _write_headered_aac(path: Path, *, max_bps: int, avg_bps: int) -> Path:
    payload = _audio_sample_entry_header() + _esds(max_bps, avg_bps)
    path.write_bytes(_m4a_tree(_stsd(payload)))
    return path


def test_mode_from_mp3_info_maps_known_modes():
    assert mode_from_mp3_info(SimpleNamespace(bitrate_mode=BitrateMode.CBR)) == CBR
    assert mode_from_mp3_info(SimpleNamespace(bitrate_mode=BitrateMode.VBR)) == VBR
    assert mode_from_mp3_info(SimpleNamespace(bitrate_mode=BitrateMode.ABR)) == ABR


def test_mode_from_mp3_info_unknown_or_missing_is_none():
    assert mode_from_mp3_info(SimpleNamespace(bitrate_mode=BitrateMode.UNKNOWN)) is None
    assert mode_from_mp3_info(SimpleNamespace()) is None
    assert mode_from_mp3_info(SimpleNamespace(bitrate_mode="cbr")) is None


def test_mode_from_esds_bitrates():
    assert mode_from_esds_bitrates(MAX_VBR, AVG_VBR) == VBR
    assert mode_from_esds_bitrates(CBR_BPS, CBR_BPS) == CBR
    assert mode_from_esds_bitrates(0, AVG_VBR) is None
    assert mode_from_esds_bitrates(MAX_VBR, 0) is None
    assert mode_from_esds_bitrates(None, AVG_VBR) is None
    assert mode_from_esds_bitrates(MAX_VBR, None) is None
    assert mode_from_esds_bitrates(AVG_VBR, MAX_VBR) is None


def test_read_mp4_esds_bitrates_headered_vbr(tmp_path: Path):
    path = _write_headered_aac(tmp_path / "vbr.m4a", max_bps=MAX_VBR, avg_bps=AVG_VBR)
    assert read_mp4_esds_bitrates(path) == (MAX_VBR, AVG_VBR)
    assert lossy_bitrate_mode(source_codec="aac", info=object(), path=path) == VBR


def test_read_mp4_esds_bitrates_headered_cbr(tmp_path: Path):
    path = _write_headered_aac(tmp_path / "cbr.m4a", max_bps=CBR_BPS, avg_bps=CBR_BPS)
    assert read_mp4_esds_bitrates(path) == (CBR_BPS, CBR_BPS)
    assert lossy_bitrate_mode(source_codec="aac", info=object(), path=path) == CBR


def test_read_mp4_esds_bitrates_no_esds(tmp_path: Path):
    path = tmp_path / "no-esds.m4a"
    path.write_bytes(_m4a_tree(_stsd(_audio_sample_entry_header())))
    assert read_mp4_esds_bitrates(path) == (None, None)


def test_read_mp4_esds_unheadered_is_not_accepted(tmp_path: Path):
    """esds immediately after the mp4a type is not a valid AudioSampleEntry."""
    path = tmp_path / "bare-esds.m4a"
    path.write_bytes(_m4a_tree(_stsd(_esds(MAX_VBR, AVG_VBR))))
    assert read_mp4_esds_bitrates(path) == (None, None)


def test_lossy_bitrate_mode_skips_non_lossy(tmp_path: Path):
    path = tmp_path / "x.flac"
    path.write_bytes(b"")
    info = SimpleNamespace(bitrate_mode=BitrateMode.CBR)
    assert lossy_bitrate_mode(source_codec="flac", info=info, path=path) is None
    assert lossy_bitrate_mode(source_codec="alac", info=info, path=path) is None
    assert lossy_bitrate_mode(source_codec=None, info=info, path=path) is None
