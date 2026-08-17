"""Source audio tech probe with mocked mutagen and ffprobe."""

from types import SimpleNamespace
from unittest.mock import patch

from musicweb.transcode.probe import SourceAudioTech, probe_source_audio_tech, tech_from_track


def test_tech_from_track_maps_attributes():
    track = SimpleNamespace(
        sample_rate_hz=48000,
        bit_depth=24,
        channels=2,
        source_codec="flac",
    )
    tech = tech_from_track(track)
    assert tech == SourceAudioTech(48000, 24, 2, "flac")


def test_probe_returns_complete_known_without_io(tmp_path):
    path = tmp_path / "x.flac"
    path.write_bytes(b"x")
    known = SourceAudioTech(44100, 16)
    with (
        patch("musicweb.metadata.read_metadata") as read_meta,
        patch("subprocess.run") as run,
    ):
        result = probe_source_audio_tech(path, known=known)
    assert result.sample_rate_hz == 44100
    assert result.bit_depth == 16
    read_meta.assert_not_called()
    run.assert_not_called()


def test_probe_fills_from_mutagen(tmp_path):
    path = tmp_path / "x.flac"
    path.write_bytes(b"x")
    meta = SimpleNamespace(
        sample_rate_hz=96000,
        bit_depth=24,
        channels=2,
        source_codec="flac",
    )
    with (
        patch("musicweb.metadata.read_metadata", return_value=meta) as read_meta,
        patch("subprocess.run") as run,
    ):
        result = probe_source_audio_tech(path, known=SourceAudioTech(None, None))
    read_meta.assert_called_once()
    run.assert_not_called()
    assert result == SourceAudioTech(96000, 24, 2, "flac")


def test_probe_parses_ffprobe_when_mutagen_fails(tmp_path):
    path = tmp_path / "x.flac"
    path.write_bytes(b"x")
    stdout = (
        b"sample_rate=48000\n"
        b"bits_per_raw_sample=24\n"
        b"bits_per_sample=16\n"
        b"channels=2\n"
        b"codec_name=flac\n"
    )
    proc = SimpleNamespace(stdout=stdout)
    with (
        patch("musicweb.metadata.read_metadata", side_effect=OSError("bad")),
        patch("subprocess.run", return_value=proc) as run,
    ):
        result = probe_source_audio_tech(path)
    run.assert_called_once()
    assert result.sample_rate_hz == 48000
    assert result.bit_depth == 24
    assert result.channels == 2
    assert result.source_codec == "flac"
