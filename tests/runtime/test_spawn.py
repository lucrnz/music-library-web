"""runtime.spawn flags: CREATE_NO_WINDOW on Windows only."""

from __future__ import annotations

from unittest.mock import MagicMock

from musicweb.runtime import spawn


def test_run_omits_creationflags_off_windows(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(spawn.subprocess, "run", mock)
    monkeypatch.setattr(spawn.sys, "platform", "darwin")
    spawn.run(["echo"], check=False)
    _args, kwargs = mock.call_args
    assert "creationflags" not in kwargs


def test_popen_omits_creationflags_off_windows(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(spawn.subprocess, "Popen", mock)
    monkeypatch.setattr(spawn.sys, "platform", "darwin")
    spawn.popen(["echo"])
    _args, kwargs = mock.call_args
    assert "creationflags" not in kwargs


def test_run_sets_create_no_window_on_win32(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(spawn.subprocess, "run", mock)
    monkeypatch.setattr(spawn.sys, "platform", "win32")
    monkeypatch.setattr(spawn.subprocess, "CREATE_NO_WINDOW", 0x08000000, raising=False)
    spawn.run(["echo"], check=False)
    _args, kwargs = mock.call_args
    assert kwargs["creationflags"] & 0x08000000


def test_popen_ors_existing_creationflags_on_win32(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(spawn.subprocess, "Popen", mock)
    monkeypatch.setattr(spawn.sys, "platform", "win32")
    monkeypatch.setattr(spawn.subprocess, "CREATE_NO_WINDOW", 0x08000000, raising=False)
    spawn.popen(["echo"], creationflags=0x1)
    _args, kwargs = mock.call_args
    assert kwargs["creationflags"] & 0x08000000
    assert kwargs["creationflags"] & 0x1
