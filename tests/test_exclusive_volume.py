"""Exclusive volume policy: plan, tenure, ExclusiveVolume."""

from musicweb.exclusive.protocol import VOLUME_DIGITAL, VOLUME_HARDWARE
from musicweb.exclusive.volume import (
    ExclusiveVolume,
    Restore,
    VolumeTenure,
    plan_volume,
)


def test_plan_volume_hardware_keeps_digital_unity():
    user, digital, path = plan_volume(80, hardware_applied=True)
    assert user == 80.0
    assert digital == 100.0
    assert path == VOLUME_HARDWARE


def test_plan_volume_digital_matches_user():
    user, digital, path = plan_volume(80, hardware_applied=False)
    assert user == 80.0
    assert digital == 80.0
    assert path == VOLUME_DIGITAL


def test_plan_volume_clamps():
    lo, lo_d, _ = plan_volume(-10, hardware_applied=False)
    assert lo == 0.0
    assert lo_d == 0.0
    hi, hi_d, path = plan_volume(140, hardware_applied=True)
    assert hi == 100.0
    assert hi_d == 100.0
    assert path == VOLUME_HARDWARE


def test_exclusive_volume_defaults():
    ev = ExclusiveVolume(
        get_hw=lambda _id: None, set_hw=lambda _i, _v: False, set_digital=lambda _d: None
    )
    assert ev.user == 100.0
    assert ev.path == VOLUME_DIGITAL
    assert ev.device_id is None


def test_tenure_reads_once_same_id_does_not_reread():
    reads: list[str] = []

    def read(device_id: str) -> float | None:
        reads.append(device_id)
        return 25.0

    tenure = VolumeTenure()
    assert tenure.prepare("A", read_volume=read) is None
    assert reads == ["A"]
    assert tenure.prepare("A", read_volume=read) is None
    assert reads == ["A"]


def test_tenure_none_read_means_no_restore():
    tenure = VolumeTenure()
    tenure.prepare("A", read_volume=lambda _id: None)
    assert tenure.release() is None


def test_tenure_new_id_yields_old_restore():
    tenure = VolumeTenure()
    tenure.prepare("A", read_volume=lambda _id: 25.0)
    restore = tenure.prepare("B", read_volume=lambda _id: 40.0)
    assert restore == Restore("A", 25.0)
    assert tenure.device_id == "B"
    assert tenure.release() == Restore("B", 40.0)
    assert tenure.device_id is None
    assert tenure.release() is None


class _FakeHw:
    def __init__(self) -> None:
        self.reads: list[str] = []
        self.sets: list[tuple[str, float]] = []
        self.digital: list[float] = []
        self.hw_ok = True
        self.levels: dict[str, float | None] = {}

    def get(self, device_id: str) -> float | None:
        self.reads.append(device_id)
        return self.levels.get(device_id, 30.0)

    def set(self, device_id: str, volume: float) -> bool:
        self.sets.append((device_id, volume))
        return self.hw_ok

    def set_digital(self, digital: float) -> None:
        self.digital.append(digital)


def test_exclusive_volume_hardware_success():
    hw = _FakeHw()
    ev = ExclusiveVolume(get_hw=hw.get, set_hw=hw.set, set_digital=hw.set_digital)
    ev.on_device("coreaudio/A")
    ev.set_user(80)
    assert ev.user == 80.0
    assert ev.path == VOLUME_HARDWARE
    assert hw.sets == [("coreaudio/A", 80.0)]
    assert hw.digital[-1] == 100.0


def test_exclusive_volume_hardware_fail_open():
    hw = _FakeHw()
    hw.hw_ok = False
    ev = ExclusiveVolume(get_hw=hw.get, set_hw=hw.set, set_digital=hw.set_digital)
    ev.on_device("coreaudio/A")
    ev.set_user(80)
    assert ev.path == VOLUME_DIGITAL
    assert hw.digital[-1] == 80.0


def test_exclusive_volume_path_flips_on_later_failed_write():
    hw = _FakeHw()
    ev = ExclusiveVolume(get_hw=hw.get, set_hw=hw.set, set_digital=hw.set_digital)
    ev.on_device("coreaudio/A")
    ev.set_user(80)
    assert ev.path == VOLUME_HARDWARE
    hw.hw_ok = False
    ev.apply()
    assert ev.path == VOLUME_DIGITAL
    assert hw.digital[-1] == 80.0


def test_on_release_clears_live_id_later_apply_skips_hw():
    hw = _FakeHw()
    ev = ExclusiveVolume(get_hw=hw.get, set_hw=hw.set, set_digital=hw.set_digital)
    ev.on_device("coreaudio/A")
    ev.set_user(80)
    restore = ev.on_release()
    assert restore == Restore("coreaudio/A", 30.0)
    assert ev.device_id is None
    before = list(hw.sets)
    ev.apply()
    assert hw.sets == before
    assert ev.path == VOLUME_DIGITAL
    assert hw.digital[-1] == 80.0
