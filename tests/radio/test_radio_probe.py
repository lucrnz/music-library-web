"""file_is_playable with mocked subprocess (never spawn ffprobe)."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from musicweb.radio.probe import file_is_playable


def test_playable_when_audio_stream_present(tmp_path):
    path = tmp_path / "ok.flac"
    path.write_bytes(b"x")
    proc = SimpleNamespace(returncode=0, stdout=b"audio\n", stderr=b"")
    with patch("subprocess.run", return_value=proc) as run:
        assert file_is_playable(path) is True
    run.assert_called_once()
    argv = run.call_args.args[0]
    assert argv[0] == "ffprobe"
    assert str(path) in argv
    assert run.call_args.kwargs["timeout"] == 15


def test_unplayable_on_nonzero_or_no_audio(tmp_path):
    path = tmp_path / "bad.flac"
    path.write_bytes(b"x")
    with patch(
        "subprocess.run",
        return_value=SimpleNamespace(returncode=1, stdout=b"", stderr=b"err"),
    ):
        assert file_is_playable(path) is False
    with patch(
        "subprocess.run",
        return_value=SimpleNamespace(returncode=0, stdout=b"\n", stderr=b""),
    ):
        assert file_is_playable(path) is False


def test_unplayable_when_ffprobe_missing(tmp_path):
    path = tmp_path / "x.flac"
    path.write_bytes(b"x")
    with patch("subprocess.run", side_effect=FileNotFoundError("ffprobe")):
        assert file_is_playable(path) is False


def test_never_uses_raw_relpath():
    """The probe is called with a Path; catalog must resolve first."""
    path = Path("/resolved/abs/track.flac")
    with patch(
        "subprocess.run",
        return_value=SimpleNamespace(returncode=0, stdout=b"audio\n", stderr=b""),
    ) as run:
        file_is_playable(path)
    assert run.call_args.args[0][-1] == str(path)
