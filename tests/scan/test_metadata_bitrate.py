"""read_metadata must return extracted bitrate and MP3 bitrate mode."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from mutagen.mp3 import BitrateMode

from musicweb.metadata import read_metadata


def _mp3_audio(*, tags, bitrate_mode=BitrateMode.CBR, bitrate=320_000):
    info = SimpleNamespace(
        bitrate=bitrate,
        sample_rate=44100,
        length=1.0,
        bitrate_mode=bitrate_mode,
    )
    return SimpleNamespace(info=info, tags=tags)


def test_read_metadata_returns_extracted_bitrate_on_success(tmp_path: Path):
    path = tmp_path / "song.mp3"
    path.write_bytes(b"x")
    audio = _mp3_audio(tags={"title": ["Song"]}, bitrate=320_000)
    with patch("musicweb.metadata.MutagenFile", return_value=audio):
        meta = read_metadata(path)
    assert meta.bitrate_kbps == 320
    assert meta.bitrate_mode == "cbr"
    assert meta.source_codec == "mp3"
    assert meta.title == "Song"


def test_read_metadata_returns_extracted_bitrate_when_tags_none(tmp_path: Path):
    path = tmp_path / "untagged.mp3"
    path.write_bytes(b"x")
    audio = _mp3_audio(tags=None, bitrate=256_000, bitrate_mode=BitrateMode.VBR)
    with patch("musicweb.metadata.MutagenFile", return_value=audio):
        meta = read_metadata(path)
    assert meta.bitrate_kbps == 256
    assert meta.bitrate_mode == "vbr"
    assert meta.source_codec == "mp3"
    assert meta.title == "untagged"


def test_read_metadata_mp3_abr_mode(tmp_path: Path):
    path = tmp_path / "abr.mp3"
    path.write_bytes(b"x")
    audio = _mp3_audio(tags={"title": ["A"]}, bitrate=192_000, bitrate_mode=BitrateMode.ABR)
    with patch("musicweb.metadata.MutagenFile", return_value=audio):
        meta = read_metadata(path)
    assert meta.bitrate_kbps == 192
    assert meta.bitrate_mode == "abr"
