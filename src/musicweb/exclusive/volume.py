"""Exclusive volume policy: slider plan, one-device tenure, injected I/O."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass

from musicweb.exclusive.protocol import VOLUME_DIGITAL, VOLUME_HARDWARE

logger = logging.getLogger(__name__)

ReadVolume = Callable[[str], float | None]
SetHardware = Callable[[str, float], bool]
SetDigital = Callable[[float], None]


def clamp_volume(volume_0_100: float) -> float:
    return max(0.0, min(100.0, float(volume_0_100)))


def plan_volume(
    volume_0_100: float, *, hardware_applied: bool
) -> tuple[float, float, str]:
    """Return (user, digital_mpv, path). Hardware success keeps mpv at unity."""
    user = clamp_volume(volume_0_100)
    if hardware_applied:
        return user, 100.0, VOLUME_HARDWARE
    return user, user, VOLUME_DIGITAL


@dataclass(frozen=True)
class Restore:
    device_id: str
    volume: float


class VolumeTenure:
    """Snapshot hardware volume once per device; yield restore on leave."""

    def __init__(self) -> None:
        self._device_id: str | None = None
        self._saved: float | None = None
        self._snapshotted = False

    @property
    def device_id(self) -> str | None:
        return self._device_id

    @property
    def saved(self) -> float | None:
        return self._saved

    def prepare(
        self, device_id: str, *, read_volume: ReadVolume
    ) -> Restore | None:
        if device_id == self._device_id:
            logger.debug(
                "volume tenure keep device=%s (no re-read)", device_id
            )
            return None
        restore = self._take_restore()
        self._device_id = device_id
        self._saved = read_volume(device_id)
        self._snapshotted = True
        logger.debug(
            "volume tenure snapshot device=%s saved=%s",
            device_id,
            self._saved,
        )
        return restore

    def release(self) -> Restore | None:
        restore = self._take_restore()
        self._device_id = None
        self._saved = None
        self._snapshotted = False
        return restore

    def _take_restore(self) -> Restore | None:
        if (
            self._device_id is not None
            and self._snapshotted
            and self._saved is not None
        ):
            logger.debug(
                "volume tenure restore device=%s volume=%.1f",
                self._device_id,
                self._saved,
            )
            return Restore(self._device_id, self._saved)
        logger.debug("volume tenure restore skipped (no snapshot)")
        return None


class ExclusiveVolume:
    """Slider + tenure + one apply(). Restore I/O stays with the caller."""

    def __init__(
        self,
        *,
        get_hw: ReadVolume,
        set_hw: SetHardware,
        set_digital: SetDigital,
    ) -> None:
        self._get_hw = get_hw
        self._set_hw = set_hw
        self._set_digital = set_digital
        self._tenure = VolumeTenure()
        self.user = 100.0
        self.path = VOLUME_DIGITAL
        self.known = False

    @property
    def device_id(self) -> str | None:
        return self._tenure.device_id

    def set_user(self, volume_0_100: float) -> None:
        self.user = clamp_volume(volume_0_100)
        self.known = True
        self.apply()

    def on_device(self, device_id: str) -> Restore | None:
        prev = self._tenure.device_id
        restore = self._tenure.prepare(device_id, read_volume=self._get_hw)
        if device_id != prev:
            snap = self._tenure.saved
            if snap is not None:
                self.user = clamp_volume(snap)
                self.known = True
                logger.debug(
                    "exclusive volume adopt pre-hog device=%s volume=%.1f",
                    device_id,
                    self.user,
                )
            else:
                logger.debug(
                    "exclusive volume no pre-hog read device=%s; "
                    "slider unchanged user=%.1f",
                    device_id,
                    self.user,
                )
        return restore

    def on_release(self) -> Restore | None:
        return self._tenure.release()

    def apply(self) -> None:
        live = self._tenure.device_id
        hw_ok = False
        if live is not None:
            hw_ok = bool(self._set_hw(live, self.user))
        _user, digital, path = plan_volume(
            self.user, hardware_applied=hw_ok
        )
        self.path = path
        logger.debug(
            "exclusive volume decision device=%s user=%.1f "
            "hardware_applied=%s path=%s digital=%.1f",
            live,
            self.user,
            hw_ok,
            path,
            digital,
        )
        self._set_digital(digital)
