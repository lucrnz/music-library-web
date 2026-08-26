"""musicweb companion CLI: help, hard-cut exclusive-audio, COMPANION_TOKEN gate."""

from __future__ import annotations

import logging
from pathlib import Path

import pytest
from typer.testing import CliRunner

from musicweb.cli.app import app
from musicweb.cli.companion import (
    DropWsTimeFrames,
    banner_lines,
    configure_companion_logging,
    resolve_debug_env,
)

runner = CliRunner()


@pytest.fixture(autouse=True)
def _restore_logging():
    root = logging.getLogger()
    prev_level = root.level
    prev_handlers = [(h, h.level) for h in root.handlers]
    yield
    root.setLevel(prev_level)
    for handler, level in prev_handlers:
        handler.setLevel(level)


def test_companion_help():
    result = runner.invoke(app, ["companion", "--help"])
    assert result.exit_code == 0
    assert "Desktop companion" in result.stdout
    assert "COMPANION_TOKEN" in result.stdout
    assert "DEBUG" in result.stdout
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
    assert "data-dir lock" not in text


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


def test_resolve_debug_env_true_false_0_1():
    assert resolve_debug_env(None) == (False, None)
    assert resolve_debug_env("") == (False, None)
    assert resolve_debug_env("  ") == (False, None)
    for raw in ("true", "TRUE", "True", "1", " 1 "):
        assert resolve_debug_env(raw) == (True, None)
    for raw in ("false", "FALSE", "0", " 0 "):
        assert resolve_debug_env(raw) == (False, None)
    enabled, warn = resolve_debug_env("yes")
    assert enabled is False
    assert warn is not None
    assert "true/false/0/1" in warn


def test_configure_companion_logging_raises_level():
    root = logging.getLogger()
    configure_companion_logging(debug=True)
    assert root.level == logging.DEBUG
    configure_companion_logging(debug=False)
    assert root.level == logging.INFO


def _ws_record(msg: str) -> logging.LogRecord:
    return logging.LogRecord(
        name="uvicorn.error",
        level=logging.DEBUG,
        pathname="",
        lineno=0,
        msg=msg,
        args=(),
        exc_info=None,
    )


def test_ws_time_frames_are_dropped():
    filt = DropWsTimeFrames()
    assert (
        filt.filter(
            _ws_record(
                '> TEXT \'{"v":1,"type":"time","t":1.2,"d":180.0}\' [48 bytes]'
            )
        )
        is False
    )
    assert (
        filt.filter(
            _ws_record(
                '> TEXT \'{"v":1,"type":"status","role":"controller"}\' [44 bytes]'
            )
        )
        is True
    )
    assert filt.filter(_ws_record("< TEXT '{\"v\":1,\"type\":\"heartbeat\"}' [26 bytes]"))
    assert filt.filter(_ws_record("> PING af a3 b8 1d [binary, 4 bytes]"))
    assert filt.filter(_ws_record('> TEXT \'{"v":1,"type":"timeout"}\' [28 bytes]'))


def test_configure_companion_logging_installs_time_filter():
    configure_companion_logging(debug=True)
    names = {type(f).__name__ for f in logging.getLogger("uvicorn.error").filters}
    assert "DropWsTimeFrames" in names


def _stub_companion_run(monkeypatch) -> dict:
    seen: dict = {}
    monkeypatch.setattr("musicweb.cli.companion.load_env_file", lambda: None)
    monkeypatch.setattr("musicweb.cli.companion.is_macos", lambda: False)
    monkeypatch.setattr("musicweb.cli.companion.check_loopback_port", lambda _p: None)
    monkeypatch.setattr(
        "musicweb.cli.companion.serve_loopback",
        lambda *_a, **k: seen.update(k),
    )
    monkeypatch.setenv("COMPANION_TOKEN", "secret")
    return seen


def test_companion_sources_debug_true(monkeypatch):
    seen = _stub_companion_run(monkeypatch)
    monkeypatch.setenv("DEBUG", "true")
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 0
    assert seen.get("log_level") == "debug"


def test_companion_sources_debug_1(monkeypatch):
    seen = _stub_companion_run(monkeypatch)
    monkeypatch.setenv("DEBUG", "1")
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 0
    assert seen.get("log_level") == "debug"


def test_companion_sources_debug_false(monkeypatch):
    seen = _stub_companion_run(monkeypatch)
    monkeypatch.setenv("DEBUG", "false")
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 0
    assert seen.get("log_level") == "info"


def test_companion_sources_debug_0(monkeypatch):
    seen = _stub_companion_run(monkeypatch)
    monkeypatch.setenv("DEBUG", "0")
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 0
    assert seen.get("log_level") == "info"


def test_companion_debug_unset_is_info(monkeypatch):
    seen = _stub_companion_run(monkeypatch)
    monkeypatch.delenv("DEBUG", raising=False)
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 0
    assert seen.get("log_level") == "info"


def test_companion_unknown_debug_warns(monkeypatch):
    _stub_companion_run(monkeypatch)
    monkeypatch.setenv("DEBUG", "yes")
    result = runner.invoke(app, ["companion"])
    assert result.exit_code == 0
    combined = f"{result.stdout}\n{result.stderr}"
    assert "true/false/0/1" in combined


def test_banner_debug_line_only_when_enabled():
    quiet = banner_lines(18765, "/opt/mpv", Path("/tmp/musicweb-companion"))
    assert "debug" not in quiet
    verbose = banner_lines(
        18765, "/opt/mpv", Path("/tmp/musicweb-companion"), debug=True
    )
    assert "debug      verbose" in verbose
