"""Core Audio volume policy: keys, success predicate, fake property I/O."""

from __future__ import annotations

import logging

from musicweb.exclusive.coreaudio import (
    MUTE_SELECTORS,
    VOLUME_SELECTORS,
    AudioDevice,
    VolumeSelector,
    apply_hardware_volume,
    coreaudio_device_key,
    get_device_volume,
    hardware_set_succeeded,
    match_device_key,
    merge_output_devices,
    read_hardware_volume,
    set_device_volume,
)


class FakeVolumeIO:
    def __init__(self) -> None:
        self.scalars: dict[tuple[int, int, int], float] = {}
        self.writable: set[tuple[int, int, int]] = set()
        self.present: set[tuple[int, int, int]] = set()
        self.mutes: dict[tuple[int, int, int], bool] = {}
        self.mute_writable: set[tuple[int, int, int]] = set()
        self.set_scalar_calls: list[tuple[VolumeSelector, float]] = []
        self.set_mute_calls: list[tuple[VolumeSelector, bool]] = []

    def _key(self, sel: VolumeSelector) -> tuple[int, int, int]:
        return (sel.selector, sel.scope, sel.element)

    def allow_scalar(self, sel: VolumeSelector, value: float = 0.5) -> None:
        k = self._key(sel)
        self.present.add(k)
        self.writable.add(k)
        self.scalars[k] = value

    def allow_mute(self, sel: VolumeSelector, muted: bool = False) -> None:
        k = self._key(sel)
        self.present.add(k)
        self.mute_writable.add(k)
        self.mutes[k] = muted

    def has(self, sel: VolumeSelector) -> bool:
        return self._key(sel) in self.present

    def get_scalar(self, sel: VolumeSelector) -> float | None:
        return self.scalars.get(self._key(sel))

    def set_scalar(self, sel: VolumeSelector, value_0_1: float) -> bool:
        self.set_scalar_calls.append((sel, value_0_1))
        k = self._key(sel)
        if k not in self.writable:
            return False
        self.scalars[k] = value_0_1
        return True

    def set_mute(self, sel: VolumeSelector, muted: bool) -> bool:
        self.set_mute_calls.append((sel, muted))
        k = self._key(sel)
        if k not in self.mute_writable:
            return False
        self.mutes[k] = muted
        return True


def test_merge_output_devices_prefers_uid_then_name():
    ca = [
        AudioDevice(
            id="coreaudio/uid-a",
            name="Speakers",
            sample_rates=[44100],
            bit_depths=[16],
            mpv_device="coreaudio/uid-a",
        ),
        AudioDevice(
            id="coreaudio/uid-b",
            name="DAC",
            sample_rates=[96000],
            bit_depths=[24],
            mpv_device="coreaudio/uid-b",
        ),
    ]
    mpv = [
        AudioDevice(
            id="coreaudio/uid-a",
            name="Mac Speakers",
            sample_rates=[44100, 48000],
            bit_depths=[16, 24],
            mpv_device="coreaudio/uid-a",
        ),
        AudioDevice(
            id="coreaudio/other",
            name="dac",
            sample_rates=[48000],
            bit_depths=[16],
            mpv_device="coreaudio/other",
        ),
    ]
    merged = merge_output_devices(ca, mpv)
    assert merged[0].id == "coreaudio/uid-a"
    assert merged[0].sample_rates == [44100]
    assert merged[0].bit_depths == [16]
    assert merged[1].id == "coreaudio/other"
    assert merged[1].sample_rates == [96000]
    assert merged[1].bit_depths == [24]


def test_merge_output_devices_empty_mpv_keeps_coreaudio():
    ca = [
        AudioDevice(
            id="coreaudio/uid-a",
            name="Speakers",
            sample_rates=[44100],
            bit_depths=[16],
            mpv_device="coreaudio/uid-a",
        )
    ]
    assert merge_output_devices(ca, []) == ca


def test_coreaudio_device_key_strips_prefix_only():
    assert coreaudio_device_key("coreaudio/BuiltInSpeakerDevice") == (
        "BuiltInSpeakerDevice"
    )
    assert coreaudio_device_key("COREAUDIO/x") == "x"
    assert coreaudio_device_key("BuiltInSpeakerDevice") == "BuiltInSpeakerDevice"
    assert coreaudio_device_key("  coreaudio/uid  ") == "uid"


def test_match_device_key_uid_numeric_name():
    assert match_device_key(
        "coreaudio/BuiltInSpeakerDevice",
        uid="BuiltInSpeakerDevice",
        numeric_id=99,
        name="MacBook Pro Speakers",
    )
    assert match_device_key(
        "99", uid="other", numeric_id=99, name="Speakers"
    )
    assert match_device_key(
        "MacBook Pro Speakers",
        uid="uid",
        numeric_id=1,
        name="macbook pro speakers",
    )
    assert not match_device_key(
        "", uid="BuiltInSpeakerDevice", numeric_id=1, name="Speakers"
    )
    assert not match_device_key(
        "nope", uid="BuiltInSpeakerDevice", numeric_id=1, name="Speakers"
    )


def test_hardware_set_succeeded_cases():
    assert hardware_set_succeeded(
        True, True, mute_present=True, volume=80
    )
    assert hardware_set_succeeded(
        True, False, mute_present=False, volume=80
    )
    assert not hardware_set_succeeded(
        True, False, mute_present=True, volume=80
    )
    assert not hardware_set_succeeded(
        False, True, mute_present=True, volume=80
    )
    assert hardware_set_succeeded(
        False, True, mute_present=True, volume=0
    )
    assert not hardware_set_succeeded(
        False, True, mute_present=True, volume=80
    )
    assert hardware_set_succeeded(
        True, False, mute_present=False, volume=0
    )


def test_apply_tries_all_selectors_after_first_success():
    io = FakeVolumeIO()
    for sel in VOLUME_SELECTORS:
        io.allow_scalar(sel)
    assert apply_hardware_volume(80, io)
    assert [c[0] for c in io.set_scalar_calls] == list(VOLUME_SELECTORS)
    assert all(abs(v - 0.8) < 1e-9 for _s, v in io.set_scalar_calls)


def test_apply_unmute_not_enough_without_scalar():
    io = FakeVolumeIO()
    for sel in MUTE_SELECTORS:
        io.allow_mute(sel, muted=True)
    assert not apply_hardware_volume(80, io)
    assert io.set_mute_calls
    assert not io.set_scalar_calls or all(
        not io.has(s) or io._key(s) not in io.writable for s, _ in io.set_scalar_calls
    )


def test_apply_logs_selector_decision(caplog):
    io = FakeVolumeIO()
    io.allow_scalar(VOLUME_SELECTORS[0])
    io.allow_mute(MUTE_SELECTORS[0], muted=True)
    with caplog.at_level(logging.DEBUG, logger="musicweb.exclusive.coreaudio"):
        assert apply_hardware_volume(50, io)
    assert "hardware volume apply" in caplog.text
    assert "applied=True" in caplog.text
    assert "scalar_ok=True" in caplog.text
    assert "mute_ok=True" in caplog.text


def test_apply_scalar_plus_unmute():
    io = FakeVolumeIO()
    io.allow_scalar(VOLUME_SELECTORS[0])
    io.allow_mute(MUTE_SELECTORS[0], muted=True)
    assert apply_hardware_volume(50, io)
    assert any(not muted for _s, muted in io.set_mute_calls)


def test_apply_mute_only_at_zero():
    io = FakeVolumeIO()
    io.allow_mute(MUTE_SELECTORS[0], muted=False)
    assert apply_hardware_volume(0, io)
    assert any(muted for _s, muted in io.set_mute_calls)


def test_read_first_readable_selector_clamped():
    io = FakeVolumeIO()
    io.allow_scalar(VOLUME_SELECTORS[2], value=1.5)
    assert read_hardware_volume(io) == 100.0
    io2 = FakeVolumeIO()
    io2.allow_scalar(VOLUME_SELECTORS[0], value=0.25)
    io2.allow_scalar(VOLUME_SELECTORS[1], value=0.9)
    assert read_hardware_volume(io2) == 25.0


def test_wrappers_non_mac(monkeypatch):
    monkeypatch.setattr(
        "musicweb.exclusive.coreaudio.is_macos", lambda: False
    )
    assert set_device_volume("coreaudio/x", 80) is False
    assert get_device_volume("coreaudio/x") is None


def test_wrappers_inner_raise(monkeypatch):
    monkeypatch.setattr(
        "musicweb.exclusive.coreaudio.is_macos", lambda: True
    )
    monkeypatch.setattr(
        "musicweb.exclusive.coreaudio._set_hardware_volume",
        lambda *_a: (_ for _ in ()).throw(OSError("nope")),
    )
    monkeypatch.setattr(
        "musicweb.exclusive.coreaudio._get_hardware_volume",
        lambda *_a: (_ for _ in ()).throw(OSError("nope")),
    )
    assert set_device_volume("coreaudio/x", 80) is False
    assert get_device_volume("coreaudio/x") is None
