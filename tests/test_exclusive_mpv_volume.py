"""MpvPlayer volume hooks without starting mpv."""

from __future__ import annotations

from musicweb.exclusive import mpv_player as mpv_mod
from musicweb.exclusive.mpv_player import MpvPlayer
from musicweb.exclusive.protocol import VOLUME_DIGITAL, VOLUME_HARDWARE


def _bind(
    monkeypatch,
    *,
    levels: dict[str, float | None] | None = None,
    hw_ok: bool = True,
) -> tuple[MpvPlayer, list[tuple], list[str], list[tuple[str, float]]]:
    stored = levels if levels is not None else {"A": 25.0, "B": 40.0}
    gets: list[str] = []
    sets: list[tuple[str, float]] = []

    def fake_get(device_id: str) -> float | None:
        gets.append(device_id)
        return stored.get(device_id, 25.0)

    def fake_set(device_id: str, volume: float) -> bool:
        sets.append((device_id, volume))
        return hw_ok

    monkeypatch.setattr(mpv_mod, "get_device_volume", fake_get)
    monkeypatch.setattr(mpv_mod, "set_device_volume", fake_set)
    player = MpvPlayer()
    player._sock = object()  # digital callback may send
    cmds: list[tuple] = []
    monkeypatch.setattr(player, "_command_unlocked", lambda *a: cmds.append(a))
    return player, cmds, gets, sets


def test_start_is_stub_off_macos(monkeypatch):
    monkeypatch.setattr(mpv_mod, "is_macos", lambda: False)
    player = MpvPlayer(mpv_path="not-a-real-mpv")
    player.start()
    assert player._stub is True
    player.set_device("coreaudio/x")
    player.load("http://127.0.0.1/stream")
    player.pause()
    player.release_device()
    player.close()
    assert player._proc is None
    assert player.device is None


def test_set_device_adopts_pre_hog_volume(monkeypatch):
    player, cmds, gets, sets = _bind(monkeypatch)
    player.set_device("A")
    assert gets == ["A"]
    assert player.volume == 25.0
    snap = player.status_snapshot()
    assert snap["volume"] == 25.0
    assert snap["volume_path"] == VOLUME_HARDWARE
    assert ("A", 25.0) in sets
    assert ("set_property", "volume", 100.0) in cmds


def test_set_device_then_volume_hardware_path(monkeypatch):
    player, cmds, _gets, sets = _bind(monkeypatch)
    player.set_device("A")
    player.set_volume(80)
    assert player.volume == 80.0
    snap = player.status_snapshot()
    assert snap["volume"] == 80.0
    assert snap["volume_path"] == VOLUME_HARDWARE
    assert ("A", 80.0) in sets
    assert ("set_property", "volume", 100.0) in cmds


def test_set_volume_digital_when_hw_fails(monkeypatch):
    player, cmds, _gets, _sets = _bind(monkeypatch, hw_ok=False)
    player.set_device("A")
    player.set_volume(80)
    assert player.status_snapshot()["volume_path"] == VOLUME_DIGITAL
    assert ("set_property", "volume", 80.0) in cmds


def test_release_unhog_before_restore(monkeypatch):
    player, cmds, _gets, sets = _bind(monkeypatch)
    player.set_device("A")
    sets.clear()
    cmds.clear()
    player.release_device()
    off = cmds.index(("set_property", "audio-exclusive", False))
    assert cmds[off + 1] == ("set_property", "audio-device", "auto")
    assert sets == [("A", 25.0)]
    # restore is after exclusive off
    assert off < len(cmds)


def test_device_change_unhog_restore_arm_snapshot_once(monkeypatch):
    player, cmds, gets, sets = _bind(monkeypatch)
    player.set_device("A")
    assert gets == ["A"]
    cmds.clear()
    sets.clear()
    player.set_device("B")
    assert gets == ["A", "B"]
    off = cmds.index(("set_property", "audio-exclusive", False))
    arm = cmds.index(("set_property", "audio-exclusive", True))
    assert off < arm
    assert sets[0] == ("A", 25.0)
    assert player.volume == 40.0
    assert ("B", 40.0) in sets  # adopt B's pre-hog volume


def test_no_restore_when_snapshot_missing(monkeypatch):
    player, _cmds, _gets, sets = _bind(monkeypatch, levels={"A": None})
    player.set_device("A")
    assert player.status_snapshot()["volume"] is None
    sets.clear()
    player.release_device()
    assert sets == []


def test_audio_reconfig_while_armed_reapplies(monkeypatch):
    player, _cmds, _gets, sets = _bind(monkeypatch)
    player.set_device("A")
    player.set_volume(80)
    sets.clear()
    player._handle_ipc_message({"event": "audio-reconfig"})
    assert sets == [("A", 80.0)]


def test_audio_reconfig_after_release_does_not_write_user(monkeypatch):
    player, _cmds, _gets, sets = _bind(monkeypatch)
    player.set_device("A")
    player.set_volume(80)
    player.release_device()
    sets.clear()
    player._handle_ipc_message({"event": "audio-reconfig"})
    assert sets == []


def test_close_restores_after_unhog(monkeypatch):
    player, cmds, _gets, sets = _bind(monkeypatch)
    player.set_device("A")
    sets.clear()
    cmds.clear()
    player.close()
    assert ("set_property", "audio-exclusive", False) in cmds
    off = cmds.index(("set_property", "audio-exclusive", False))
    assert sets == [("A", 25.0)]
    # unhog recorded; restore is the set_hw write
    assert off >= 0
