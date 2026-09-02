"""MpvPlayer start/stop cycle without launching a real mpv binary."""

from __future__ import annotations

import threading
from typing import Any

from musicweb.exclusive import mpv_player as mpv_mod
from musicweb.exclusive.mpv_player import MpvPlayer


class FakeProc:
    def __init__(self) -> None:
        self.stderr = None
        self._code: int | None = None

    def poll(self) -> int | None:
        return self._code

    def terminate(self) -> None:
        self._code = 0

    def wait(self, timeout: float | None = None) -> int:
        self._code = 0
        return 0

    def kill(self) -> None:
        self._code = 0


class FakeSock:
    def __init__(self) -> None:
        self.sent: list[bytes] = []
        self._closed = threading.Event()

    def sendall(self, data: bytes) -> None:
        self.sent.append(data)

    def recv(self, n: int) -> bytes:
        self._closed.wait()
        return b""

    def close(self) -> None:
        self._closed.set()


def _patch_spawn(monkeypatch) -> list[list[str]]:
    calls: list[list[str]] = []

    def fake_popen(cmd: list[str], **_kwargs: Any) -> FakeProc:
        calls.append(list(cmd))
        return FakeProc()

    monkeypatch.setattr(mpv_mod, "hog_supported", lambda: True)
    monkeypatch.setattr(mpv_mod.shutil, "which", lambda _n: "/fake/mpv")
    monkeypatch.setattr(mpv_mod, "popen", fake_popen)
    monkeypatch.setattr(mpv_mod, "connect_ipc", lambda *_a, **_k: FakeSock())
    return calls


def test_construct_does_not_spawn(monkeypatch):
    calls = _patch_spawn(monkeypatch)
    player = MpvPlayer(mpv_path="/fake/mpv")
    assert player._proc is None
    assert player.running is False
    assert calls == []


def test_set_device_and_load_spawn_once(monkeypatch):
    calls = _patch_spawn(monkeypatch)
    player = MpvPlayer(mpv_path="/fake/mpv")
    player.set_device("coreaudio/A")
    assert len(calls) == 1
    assert player.running is True
    player.start()
    player.load("http://127.0.0.1/stream")
    assert len(calls) == 1
    player.shutdown_process()


def test_shutdown_then_set_device_spawns_again(monkeypatch):
    calls = _patch_spawn(monkeypatch)
    player = MpvPlayer(mpv_path="/fake/mpv")
    player.set_device("coreaudio/A")
    player.shutdown_process()
    assert player.running is False
    assert player._proc is None
    assert player._sock is None
    player.set_device("coreaudio/B")
    assert len(calls) == 2
    assert player.running is True
    player.shutdown_process()


def test_down_transport_does_not_spawn(monkeypatch):
    calls = _patch_spawn(monkeypatch)
    player = MpvPlayer(mpv_path="/fake/mpv")
    player.pause()
    player.resume()
    player.seek(12.0)
    player.stop()
    player.release_device()
    player.use_auto_output()
    player.set_volume(40)
    assert player.volume == 40.0
    assert calls == []
    assert player.running is False


def test_intentional_shutdown_does_not_emit_ipc_error(monkeypatch):
    _patch_spawn(monkeypatch)
    events: list[tuple[str, dict[str, Any]]] = []
    player = MpvPlayer(
        mpv_path="/fake/mpv",
        on_event=lambda name, payload: events.append((name, payload)),
    )
    player.set_device("coreaudio/A")
    player.shutdown_process()
    assert not any(name == "error" for name, _payload in events)


def test_unexpected_ipc_close_emits_error():
    events: list[tuple[str, dict[str, Any]]] = []
    player = MpvPlayer(on_event=lambda name, payload: events.append((name, payload)))

    class ClosingSock:
        def recv(self, n: int) -> bytes:
            return b""

        def close(self) -> None:
            return None

        def sendall(self, data: bytes) -> None:
            return None

    player._sock = ClosingSock()  # type: ignore[assignment]
    player._read_loop()
    assert events == [("error", {"message": "mpv IPC closed"})]


def test_close_then_start_does_not_spawn(monkeypatch):
    calls = _patch_spawn(monkeypatch)
    player = MpvPlayer(mpv_path="/fake/mpv")
    player.set_device("coreaudio/A")
    n = len(calls)
    player.close()
    player.start()
    assert len(calls) == n
    assert player.running is False
    assert player._closed is True
