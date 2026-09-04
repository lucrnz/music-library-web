"""Darwin volume resolve: BSD normalization and injected info source."""

from __future__ import annotations

from pathlib import Path

from musicweb.exclusive.optical_volume import (
    VolumeMount,
    normalize_bsd_name,
    resolve_darwin_mount,
)


class FakeVolumeInfo:
    """Withhold the mount for N ticks, then return a stated volume_id."""

    def __init__(
        self,
        mount: VolumeMount | None = None,
        *,
        withhold: int = 0,
    ) -> None:
        self.mount = mount
        self.withhold = withhold
        self.calls = 0
        self.seen: list[str] = []

    def resolve(self, device_id: str) -> VolumeMount | None:
        self.calls += 1
        self.seen.append(normalize_bsd_name(device_id))
        if self.withhold > 0:
            self.withhold -= 1
            return None
        return self.mount


def test_normalize_rdisk_and_disk():
    assert normalize_bsd_name("/dev/rdisk2") == "disk2"
    assert normalize_bsd_name("/dev/disk2") == "disk2"
    assert normalize_bsd_name("rdisk4") == "disk4"
    assert normalize_bsd_name("disk4") == "disk4"
    assert normalize_bsd_name("/dev/rdisk2s1") == "disk2s1"
    assert normalize_bsd_name("/dev/disk2s1") == "disk2s1"


def test_resolve_uses_volume_id_not_name(tmp_path: Path):
    mount = VolumeMount(name="AUDIO", path=tmp_path, volume_id="uuid-abc")
    fake = FakeVolumeInfo(mount)
    got = resolve_darwin_mount("/dev/rdisk2", info=fake)
    assert got is not None
    assert got.volume_id == "uuid-abc"
    assert got.name == "AUDIO"
    assert got.path == tmp_path
    assert fake.seen == ["disk2"]


def test_rdisk_and_disk_hit_same_bsd(tmp_path: Path):
    mount = VolumeMount(name="CD", path=tmp_path, volume_id="vol-1")
    fake = FakeVolumeInfo(mount)
    a = resolve_darwin_mount("/dev/rdisk3", info=fake)
    b = resolve_darwin_mount("/dev/disk3", info=fake)
    assert a == b
    assert fake.seen == ["disk3", "disk3"]


def test_delayed_mount_after_n_ticks(tmp_path: Path):
    mount = VolumeMount(name="MYCD", path=tmp_path, volume_id="uuid-1")
    fake = FakeVolumeInfo(mount, withhold=3)
    assert resolve_darwin_mount("/dev/rdisk2", info=fake) is None
    assert resolve_darwin_mount("/dev/rdisk2", info=fake) is None
    assert resolve_darwin_mount("/dev/rdisk2", info=fake) is None
    got = resolve_darwin_mount("/dev/rdisk2", info=fake)
    assert got is not None
    assert got.volume_id == "uuid-1"
    assert got.name == "MYCD"
    assert fake.calls == 4
