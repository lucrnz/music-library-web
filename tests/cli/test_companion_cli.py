"""musicweb companion CLI: help, hard-cut exclusive-audio, COMPANION_TOKEN gate."""

from __future__ import annotations

from typer.testing import CliRunner

from musicweb.cli.app import app

runner = CliRunner()


def test_companion_help():
    result = runner.invoke(app, ["companion", "--help"])
    assert result.exit_code == 0
    assert "Desktop companion" in result.stdout
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
    assert "uvicorn" not in result.stderr.lower()


def test_hog_token_alone_is_not_enough(monkeypatch):
    monkeypatch.setattr("musicweb.cli.companion.load_env_file", lambda: None)
    monkeypatch.delenv("COMPANION_TOKEN", raising=False)
    monkeypatch.setenv("HOG_TOKEN", "legacy-secret")
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 1
    assert "COMPANION_TOKEN" in result.stderr
