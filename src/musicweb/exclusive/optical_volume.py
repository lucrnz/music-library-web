"""Resolve a Darwin optical data volume (mount path + stable volume id).

Drive identity strings (``OpticalDrive.key`` / BSD device id) stay untouched.
``volume_id`` is the diskutil VolumeUUID, or the BSD disk behind the mount —
never the volume name.
"""

from __future__ import annotations

import logging
import plistlib
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VolumeMount:
    name: str
    path: Path
    volume_id: str


class VolumeInfoSource(Protocol):
    def resolve(self, device_id: str) -> VolumeMount | None: ...

    def device_present(self, device_id: str) -> bool | None: ...


def normalize_bsd_name(device_id: str) -> str:
    """``/dev/rdiskN`` ↔ ``/dev/diskN`` → ``diskN`` (slices kept)."""
    name = (device_id or "").strip()
    if name.startswith("/dev/"):
        name = name[5:]
    if name.startswith("rdisk"):
        name = "disk" + name[5:]
    return name


def resolve_darwin_mount(
    device_id: str,
    *,
    info: VolumeInfoSource | None = None,
) -> VolumeMount | None:
    """Map an optical BSD device to its mounted volume, if any."""
    src: VolumeInfoSource = info if info is not None else DarwinDiskutilSource()
    return src.resolve(device_id)


class DarwinDiskutilSource:
    """diskutil plist lookup. Missing diskutil / no mount → None."""

    def device_present(self, device_id: str) -> bool | None:
        """Tray presence from ``diskutil info``.

        ``True`` when the BSD device exists, ``False`` when diskutil says it
        does not, ``None`` on timeout / missing diskutil (keep last present).
        """
        bsd = normalize_bsd_name(device_id)
        if not bsd:
            return False
        return _diskutil_info_present(bsd)

    def resolve(self, device_id: str) -> VolumeMount | None:
        bsd = normalize_bsd_name(device_id)
        if not bsd:
            return None
        info = _diskutil_plist("info", "-plist", bsd)
        found = _mount_from_info(info) if info else None
        if found is not None:
            return found
        listing = _diskutil_plist("list", "-plist", bsd)
        if not listing:
            return None
        for disk in listing.get("AllDisksAndPartitions") or []:
            if not isinstance(disk, dict):
                continue
            found = _mount_from_info(disk)
            if found is not None:
                return found
            for part in disk.get("Partitions") or []:
                if not isinstance(part, dict):
                    continue
                found = _mount_from_info(part)
                if found is not None:
                    return found
        return None


def _diskutil_info_present(bsd: str) -> bool | None:
    """``True`` / ``False`` / ``None`` (unknown) for a BSD device."""
    try:
        proc = subprocess.run(
            ["diskutil", "info", "-plist", bsd],
            capture_output=True,
            timeout=5,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return None
    except OSError:
        return None
    if proc.returncode != 0:
        return False
    if not proc.stdout:
        return None
    try:
        parsed = plistlib.loads(proc.stdout)
    except Exception:
        logger.debug("diskutil plist parse failed", exc_info=True)
        return None
    return True if isinstance(parsed, dict) else None


def _diskutil_plist(*args: str) -> dict | None:
    try:
        proc = subprocess.run(
            ["diskutil", *args],
            capture_output=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0 or not proc.stdout:
        return None
    try:
        parsed = plistlib.loads(proc.stdout)
    except Exception:
        logger.debug("diskutil plist parse failed", exc_info=True)
        return None
    return parsed if isinstance(parsed, dict) else None


def _mount_from_info(info: dict | None) -> VolumeMount | None:
    if not info:
        return None
    mount = str(info.get("MountPoint") or "").strip()
    if not mount:
        return None
    path = Path(mount)
    if not path.is_dir():
        return None
    name = str(info.get("VolumeName") or "").strip() or path.name
    volume_id = str(
        info.get("VolumeUUID") or info.get("DeviceIdentifier") or ""
    ).strip()
    if not volume_id:
        return None
    return VolumeMount(name=name, path=path, volume_id=volume_id)
