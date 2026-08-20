"""Dependency checks with mocked subprocess (never spawn ffmpeg/ffprobe)."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from musicweb.transcode.deps import check_dependencies


def _proc(*, returncode: int = 0, stdout: bytes = b"", stderr: bytes = b"") -> SimpleNamespace:
    return SimpleNamespace(returncode=returncode, stdout=stdout, stderr=stderr)


def _ok_run(cmd, **_kwargs):
    name = cmd[0]
    if name == "ffmpeg":
        if "-encoders" in cmd:
            return _proc(
                stdout=b"Encoders:\n A..... libopus           libopus OPUS\n A..... flac              FLAC\n"
            )
        if "-version" in cmd:
            return _proc(stdout=b"ffmpeg version 7.0 --enable-libsoxr\n")
        if "filter=aresample" in cmd:
            return _proc(stdout=b"soxr\n")
        return _proc(stdout=b"ffmpeg\n")
    if name == "ffprobe" and "-version" in cmd:
        return _proc(stdout=b"ffprobe version 7.0\n")
    raise AssertionError(f"unexpected command: {cmd}")


def test_report_includes_ffprobe_version():
    with patch("subprocess.run", side_effect=_ok_run):
        report = check_dependencies()
    assert report.tools["ffprobe"] == "ffprobe version 7.0"
    assert "ffmpeg" in report.tools


def test_missing_ffprobe_raises():
    def run(cmd, **_kwargs):
        if cmd[0] == "ffprobe":
            raise FileNotFoundError("ffprobe")
        return _ok_run(cmd)

    with patch("subprocess.run", side_effect=run):
        with pytest.raises(RuntimeError, match="ffprobe not found"):
            check_dependencies()


def test_ffprobe_nonzero_exit_raises():
    def run(cmd, **_kwargs):
        if cmd[0] == "ffprobe":
            return _proc(returncode=1, stderr=b"broken")
        return _ok_run(cmd)

    with patch("subprocess.run", side_effect=run):
        with pytest.raises(RuntimeError, match="ffprobe is installed but failed"):
            check_dependencies()


def test_missing_libopus_still_raises():
    def run(cmd, **_kwargs):
        if cmd[0] == "ffmpeg" and "-encoders" in cmd:
            return _proc(stdout=b"Encoders:\n A..... flac              FLAC\n")
        return _ok_run(cmd)

    with patch("subprocess.run", side_effect=run):
        with pytest.raises(RuntimeError, match="libopus"):
            check_dependencies()
