"""Lossless / lossy / indexable format predicates."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from musicweb.scan.formats import (
    audio_kind,
    is_indexable_audio,
    is_lossless_audio,
    is_lossy_audio,
    mp4_kind,
)


def test_flac_is_lossless_not_lossy(tmp_path: Path):
    path = tmp_path / "track.flac"
    path.write_bytes(b"")
    assert is_lossless_audio(path) is True
    assert is_lossy_audio(path) is False
    assert is_indexable_audio(path, index_lossy=False) is True
    assert is_indexable_audio(path, index_lossy=True) is True


def test_alac_extension_is_lossless_not_lossy(tmp_path: Path):
    path = tmp_path / "track.alac"
    path.write_bytes(b"")
    assert is_lossless_audio(path) is True
    assert is_lossy_audio(path) is False


def test_mp3_is_lossy_and_flag_gated(tmp_path: Path):
    path = tmp_path / "track.mp3"
    path.write_bytes(b"")
    assert is_lossless_audio(path) is False
    assert is_lossy_audio(path) is True
    assert is_indexable_audio(path, index_lossy=False) is False
    assert is_indexable_audio(path, index_lossy=True) is True


def test_aac_m4a_is_lossy_not_lossless(tmp_path: Path):
    path = tmp_path / "track.m4a"
    path.write_bytes(b"")
    with patch("musicweb.scan.formats._probe_mp4_kind", return_value="aac"):
        assert is_lossless_audio(path) is False
        assert is_lossy_audio(path) is True
        assert is_indexable_audio(path, index_lossy=False) is False
        assert is_indexable_audio(path, index_lossy=True) is True


def test_alac_m4a_is_lossless_not_lossy(tmp_path: Path):
    path = tmp_path / "track.m4a"
    path.write_bytes(b"")
    with patch("musicweb.scan.formats._probe_mp4_kind", return_value="alac"):
        assert is_lossless_audio(path) is True
        assert is_lossy_audio(path) is False
        assert is_indexable_audio(path, index_lossy=False) is True


def test_file_cannot_be_both_lossless_and_lossy(tmp_path: Path):
    flac = tmp_path / "a.flac"
    flac.write_bytes(b"")
    mp3 = tmp_path / "b.mp3"
    mp3.write_bytes(b"")
    m4a = tmp_path / "c.m4a"
    m4a.write_bytes(b"")
    assert not (is_lossless_audio(flac) and is_lossy_audio(flac))
    assert not (is_lossless_audio(mp3) and is_lossy_audio(mp3))
    with patch("musicweb.scan.formats._probe_mp4_kind", return_value="alac"):
        assert not (is_lossless_audio(m4a) and is_lossy_audio(m4a))
    with patch("musicweb.scan.formats._probe_mp4_kind", return_value="aac"):
        assert not (is_lossless_audio(m4a) and is_lossy_audio(m4a))


def test_unreadable_m4a_is_not_indexable(tmp_path: Path):
    path = tmp_path / "track.m4a"
    path.write_bytes(b"")
    assert audio_kind(path) is None
    assert is_lossless_audio(path) is False
    assert is_lossy_audio(path) is False
    assert is_indexable_audio(path, index_lossy=True) is False


def test_indexable_m4a_probes_once(tmp_path: Path):
    path = tmp_path / "track.m4a"
    path.write_bytes(b"")
    with patch(
        "musicweb.scan.formats._probe_mp4_kind", return_value="aac"
    ) as probe:
        assert is_indexable_audio(path, index_lossy=True) is True
        assert probe.call_count == 1
    with patch(
        "musicweb.scan.formats._probe_mp4_kind", return_value="aac"
    ) as probe:
        assert is_lossless_audio(path) is False
        assert probe.call_count == 1
    with patch(
        "musicweb.scan.formats._probe_mp4_kind", return_value="aac"
    ) as probe:
        assert is_lossy_audio(path) is True
        assert probe.call_count == 1


def test_wav_never_indexable(tmp_path: Path):
    path = tmp_path / "track.wav"
    path.write_bytes(b"")
    assert is_lossless_audio(path) is False
    assert is_lossy_audio(path) is False
    assert is_indexable_audio(path, index_lossy=True) is False


def test_mp4_kind_codec_alac():
    info = SimpleNamespace(codec="alac", codec_description=None)
    assert mp4_kind(info) == "alac"


def test_mp4_kind_description_lossless():
    info = SimpleNamespace(codec="mp4a", codec_description="Apple Lossless Audio")
    assert mp4_kind(info) == "alac"


def test_mp4_kind_aac_codec():
    info = SimpleNamespace(codec="mp4a", codec_description="AAC")
    assert mp4_kind(info) == "aac"


def test_mp4_kind_none_info():
    assert mp4_kind(None) is None


def test_index_lossy_defaults_false_on_settings(monkeypatch):
    from musicweb.config import Settings

    monkeypatch.delenv("MUSICWEB_INDEX_LOSSY", raising=False)
    monkeypatch.delenv("INDEX_LOSSY", raising=False)
    assert Settings().index_lossy is False


def test_index_lossy_env_true(monkeypatch):
    from musicweb.config import Settings

    monkeypatch.setenv("MUSICWEB_INDEX_LOSSY", "true")
    assert Settings().index_lossy is True
