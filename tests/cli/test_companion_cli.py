"""musicweb companion CLI: help, hard-cut exclusive-audio, COMPANION_TOKEN gate."""

from __future__ import annotations

from pathlib import Path

from typer.testing import CliRunner

from musicweb.cli.app import app
from musicweb.cli.companion import banner_lines

runner = CliRunner()


def test_companion_help():
    result = runner.invoke(app, ["companion", "--help"])
    assert result.exit_code == 0
    assert "Desktop companion" in result.stdout
    assert "COMPANION_TOKEN" in result.stdout
    assert "--port" in result.stdout
    assert "--mpv" in result.stdout


def test_exclusive_audio_is_unknown():
    result = runner.invoke(app, ["exclusive-audio"])
    assert result.exit_code != 0
    combined = f"{result.stdout}\n{result.stderr}".lower()
    assert "no such command" in combined or "exclusive-audio" in combined


def test_missing_companion_token_exits_1(monkeypatch):
    monkeypatch.setattr("musicweb.cli.companion.load_env_file", lambda: None)
    monkeypatch.delenv("COMPANION_TOKEN", raising=False)
    monkeypatch.delenv("HOG_TOKEN", raising=False)
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 1
    assert "COMPANION_TOKEN" in result.stderr
    assert "Desktop companion" in result.stderr
    assert "Exclusive audio" not in result.stderr
    assert "uvicorn" not in result.stderr.lower()
    assert "export COMPANION_TOKEN=\"$(openssl rand -hex 16)\"" in result.stderr


def test_banner_includes_data_dir():
    text = banner_lines(18765, "/opt/mpv", Path("/tmp/musicweb-companion"))
    assert "files      /tmp/musicweb-companion" in text
    assert "ws://127.0.0.1:18765/ws" in text


def test_port_out_of_range():
    result = runner.invoke(app, ["companion", "--port", "0"])
    assert result.exit_code != 0
    result = runner.invoke(app, ["companion", "--port", "70000"])
    assert result.exit_code != 0


def test_non_mac_skips_mpv(monkeypatch):
    monkeypatch.setattr("musicweb.cli.companion.load_env_file", lambda: None)
    monkeypatch.setattr("musicweb.cli.companion.is_macos", lambda: False)
    monkeypatch.setattr("musicweb.cli.companion.check_loopback_port", lambda _p: None)
    monkeypatch.setattr("musicweb.cli.companion.serve_loopback", lambda *_a, **_k: None)
    monkeypatch.setattr("musicweb.cli.companion.shutil.which", lambda _n: None)
    monkeypatch.setenv("COMPANION_TOKEN", "secret")
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 0
    combined = f"{result.stdout}\n{result.stderr}".lower()
    assert "stub" in combined
    assert "mpv not found" not in combined


def test_mac_requires_mpv(monkeypatch):
    monkeypatch.setattr("musicweb.cli.companion.load_env_file", lambda: None)
    monkeypatch.setattr("musicweb.cli.companion.is_macos", lambda: True)
    monkeypatch.setattr("musicweb.cli.companion.check_loopback_port", lambda _p: None)
    monkeypatch.setattr("musicweb.cli.companion.shutil.which", lambda _n: None)
    monkeypatch.setenv("COMPANION_TOKEN", "secret")
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 1
    assert "mpv not found" in result.stderr


def test_hog_token_alone_is_not_enough(monkeypatch):
    monkeypatch.setattr("musicweb.cli.companion.load_env_file", lambda: None)
    monkeypatch.delenv("COMPANION_TOKEN", raising=False)
    monkeypatch.setenv("HOG_TOKEN", "legacy-secret")
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 1
    assert "COMPANION_TOKEN" in result.stderr
