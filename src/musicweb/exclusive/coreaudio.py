"""macOS Core Audio device list + format caps (ctypes).

Non-mac platforms return an empty device list. Hardware volume is best-effort.
"""

from __future__ import annotations

import logging
import platform
import sys
from dataclasses import dataclass, field
from typing import Any, Protocol

from musicweb.transcode.profiles import EXCLUSIVE_DEPTHS, EXCLUSIVE_RATES_HZ

logger = logging.getLogger(__name__)

_stub_logged: set[str] = set()


def _log_stub(action: str) -> None:
    if action in _stub_logged:
        return
    _stub_logged.add(action)
    logger.info("%s stub: no-op on this platform", action)


def fourcc(code: str) -> int:
    if len(code) != 4:
        raise ValueError(f"fourcc must be 4 characters, got {code!r}")
    return (
        (ord(code[0]) << 24)
        | (ord(code[1]) << 16)
        | (ord(code[2]) << 8)
        | ord(code[3])
    )


SCOPE_OUTPUT: int = fourcc("outp")
SCOPE_GLOBAL: int = fourcc("glob")
ELEMENT_MAIN: int = 0
SEL_DEVICES: int = fourcc("dev#")
SEL_NAME: int = fourcc("lnam")
SEL_STREAMS: int = fourcc("stm#")
SEL_NOMINAL_RATE: int = fourcc("nsrt")
SEL_RATE_RANGES: int = fourcc("nsr#")
SEL_UID: int = fourcc("uid ")
SEL_VMVC: int = fourcc("vmvc")
SEL_VOLM: int = fourcc("volm")
SEL_MUTE: int = fourcc("mute")
SEL_VMMC: int = fourcc("vmmc")
SYSTEM_OBJECT: int = 1
_CF_UTF8: int = 0x08000100


@dataclass(frozen=True)
class VolumeSelector:
    selector: int
    scope: int
    element: int


VOLUME_SELECTORS: tuple[VolumeSelector, ...] = (
    VolumeSelector(SEL_VMVC, SCOPE_OUTPUT, ELEMENT_MAIN),
    VolumeSelector(SEL_VMVC, SCOPE_GLOBAL, ELEMENT_MAIN),
    VolumeSelector(SEL_VOLM, SCOPE_OUTPUT, ELEMENT_MAIN),
    *(VolumeSelector(SEL_VOLM, SCOPE_OUTPUT, i) for i in range(1, 9)),
)

MUTE_SELECTORS: tuple[VolumeSelector, ...] = (
    VolumeSelector(SEL_VMMC, SCOPE_OUTPUT, ELEMENT_MAIN),
    VolumeSelector(SEL_MUTE, SCOPE_OUTPUT, ELEMENT_MAIN),
)


@dataclass(frozen=True)
class AudioDevice:
    """One output device with allowlist-intersected caps."""

    id: str
    name: str
    sample_rates: list[int] = field(default_factory=list)
    bit_depths: list[int] = field(default_factory=list)
    # mpv --audio-device value (coreaudio/…)
    mpv_device: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "sample_rates": list(self.sample_rates),
            "bit_depths": list(self.bit_depths),
            "mpv_device": self.mpv_device or self.id,
        }


def is_macos() -> bool:
    return sys.platform == "darwin" and platform.system() == "Darwin"


def list_output_devices() -> list[AudioDevice]:
    """Enumerate output devices with rate/depth caps ∩ allowlist."""
    if not is_macos():
        _log_stub("Core Audio device list")
        return []
    try:
        return _list_devices_coreaudio()
    except Exception as exc:
        logger.exception("Core Audio probe failed: %s", exc)
        return _list_devices_mpv_fallback()


def set_device_volume(device_id: str, volume_0_100: float) -> bool:
    """Best-effort hardware volume. Returns True if applied."""
    if not is_macos():
        _log_stub("Core Audio set volume")
        return False
    try:
        return _set_hardware_volume(device_id, volume_0_100)
    except Exception as exc:
        logger.debug("hardware volume failed: %s", exc)
        return False


def get_device_volume(device_id: str) -> float | None:
    """Best-effort hardware volume 0–100. None if unreadable."""
    if not is_macos():
        _log_stub("Core Audio get volume")
        return None
    try:
        return _get_hardware_volume(device_id)
    except Exception as exc:
        logger.debug("hardware volume read failed: %s", exc)
        return None


def coreaudio_device_key(device_id: str) -> str:
    """Strip the ``coreaudio/`` prefix from an mpv device id."""
    s = (device_id or "").strip()
    prefix = "coreaudio/"
    if s.lower().startswith(prefix):
        return s[len(prefix) :]
    return s


def match_device_key(
    requested: str, *, uid: str, numeric_id: int, name: str
) -> bool:
    """True when *requested* names this Core Audio device."""
    key = coreaudio_device_key(requested)
    if not key:
        return False
    if uid and key == uid:
        return True
    if key == str(numeric_id):
        return True
    if name and key.lower() == name.lower():
        return True
    return False


def hardware_set_succeeded(
    scalar_ok: bool,
    mute_ok: bool,
    *,
    mute_present: bool,
    volume: float,
) -> bool:
    """Whether a hardware write counts as the exclusive volume path."""
    if float(volume) > 0:
        return bool(scalar_ok) and (bool(mute_ok) or not mute_present)
    return bool(scalar_ok) or bool(mute_ok)


class VolumePropertyIO(Protocol):
    def has(self, sel: VolumeSelector) -> bool: ...

    def get_scalar(self, sel: VolumeSelector) -> float | None: ...

    def set_scalar(self, sel: VolumeSelector, value_0_1: float) -> bool: ...

    def set_mute(self, sel: VolumeSelector, muted: bool) -> bool: ...


def apply_hardware_volume(volume_0_100: float, io: VolumePropertyIO) -> bool:
    """Write volume through *io* using VOLUME_SELECTORS. No device resolve."""
    vol = max(0.0, min(100.0, float(volume_0_100)))
    scalar = vol / 100.0
    scalar_ok = False
    for sel in VOLUME_SELECTORS:
        if io.set_scalar(sel, scalar):
            scalar_ok = True
    mute_present = any(io.has(sel) for sel in MUTE_SELECTORS)
    mute_ok = False
    if vol > 0:
        if mute_present:
            mute_ok = any(io.set_mute(sel, False) for sel in MUTE_SELECTORS)
    else:
        mute_ok = any(io.set_mute(sel, True) for sel in MUTE_SELECTORS)
    return hardware_set_succeeded(
        scalar_ok, mute_ok, mute_present=mute_present, volume=vol
    )


def read_hardware_volume(io: VolumePropertyIO) -> float | None:
    """First readable selector as 0–100."""
    for sel in VOLUME_SELECTORS:
        raw = io.get_scalar(sel)
        if raw is None:
            continue
        return max(0.0, min(100.0, float(raw) * 100.0))
    return None


# --- HAL bootstrap (shared by listing and volume) ---


@dataclass
class _Hal:
    ca: Any
    cf: Any
    Address: type


_HAL: _Hal | None | bool = False  # False = not loaded


def _hal() -> _Hal | None:
    global _HAL
    if _HAL is not False:
        return _HAL
    import ctypes
    import ctypes.util
    from ctypes import POINTER, Structure, c_uint32, c_void_p

    ca_path = ctypes.util.find_library("CoreAudio")
    cf_path = ctypes.util.find_library("CoreFoundation")
    if not ca_path or not cf_path:
        _HAL = None
        return None

    ca = ctypes.CDLL(ca_path)
    cf = ctypes.CDLL(cf_path)
    os_status = ctypes.c_int32

    class AudioObjectPropertyAddress(Structure):
        _fields_ = [
            ("mSelector", c_uint32),
            ("mScope", c_uint32),
            ("mElement", c_uint32),
        ]

    ca.AudioObjectGetPropertyDataSize.argtypes = [
        c_uint32,
        POINTER(AudioObjectPropertyAddress),
        c_uint32,
        c_void_p,
        POINTER(c_uint32),
    ]
    ca.AudioObjectGetPropertyDataSize.restype = os_status
    ca.AudioObjectGetPropertyData.argtypes = [
        c_uint32,
        POINTER(AudioObjectPropertyAddress),
        c_uint32,
        c_void_p,
        POINTER(c_uint32),
        c_void_p,
    ]
    ca.AudioObjectGetPropertyData.restype = os_status
    ca.AudioObjectSetPropertyData.argtypes = [
        c_uint32,
        POINTER(AudioObjectPropertyAddress),
        c_uint32,
        c_void_p,
        c_uint32,
        c_void_p,
    ]
    ca.AudioObjectSetPropertyData.restype = os_status
    ca.AudioObjectHasProperty.argtypes = [
        c_uint32,
        POINTER(AudioObjectPropertyAddress),
    ]
    ca.AudioObjectHasProperty.restype = ctypes.c_byte
    ca.AudioObjectIsPropertySettable.argtypes = [
        c_uint32,
        POINTER(AudioObjectPropertyAddress),
        POINTER(ctypes.c_byte),
    ]
    ca.AudioObjectIsPropertySettable.restype = os_status

    cf.CFStringGetCString.argtypes = [c_void_p, c_void_p, ctypes.c_long, c_uint32]
    cf.CFStringGetCString.restype = ctypes.c_bool
    cf.CFRelease.argtypes = [c_void_p]

    _HAL = _Hal(ca=ca, cf=cf, Address=AudioObjectPropertyAddress)
    return _HAL


def _addr(hal: _Hal, selector: int, scope: int, element: int = ELEMENT_MAIN):
    return hal.Address(selector, scope, element)


def _hal_get_bytes(
    hal: _Hal, obj: int, selector: int, scope: int, element: int = ELEMENT_MAIN
) -> tuple[Any, int] | None:
    import ctypes
    from ctypes import byref, c_uint32

    addr = _addr(hal, selector, scope, element)
    size = c_uint32(0)
    st = hal.ca.AudioObjectGetPropertyDataSize(obj, byref(addr), 0, None, byref(size))
    if st != 0 or size.value == 0:
        return None
    buf = (ctypes.c_byte * size.value)()
    st = hal.ca.AudioObjectGetPropertyData(
        obj, byref(addr), 0, None, byref(size), buf
    )
    if st != 0:
        return None
    return buf, size.value


def _cfstring_from_prop(
    hal: _Hal, obj: int, selector: int, scope: int
) -> str | None:
    import ctypes
    from ctypes import byref, c_uint32, c_void_p, sizeof

    cfstr = c_void_p()
    nsize = c_uint32(sizeof(c_void_p))
    addr = _addr(hal, selector, scope)
    st = hal.ca.AudioObjectGetPropertyData(
        obj, byref(addr), 0, None, byref(nsize), byref(cfstr)
    )
    if st != 0 or not cfstr.value:
        return None
    cbuf = ctypes.create_string_buffer(512)
    text: str | None = None
    if hal.cf.CFStringGetCString(cfstr, cbuf, 512, _CF_UTF8):
        text = cbuf.value.decode("utf-8", errors="replace")
    hal.cf.CFRelease(cfstr)
    return text


class _HalVolumeIO:
    def __init__(self, audio_id: int) -> None:
        self._id = audio_id
        hal = _hal()
        if hal is None:
            raise RuntimeError("Core Audio unavailable")
        self._hal = hal

    def has(self, sel: VolumeSelector) -> bool:
        from ctypes import byref

        addr = _addr(self._hal, sel.selector, sel.scope, sel.element)
        return bool(self._hal.ca.AudioObjectHasProperty(self._id, byref(addr)))

    def _settable(self, sel: VolumeSelector) -> bool:
        import ctypes
        from ctypes import byref

        addr = _addr(self._hal, sel.selector, sel.scope, sel.element)
        flag = ctypes.c_byte(0)
        st = self._hal.ca.AudioObjectIsPropertySettable(
            self._id, byref(addr), byref(flag)
        )
        return st == 0 and bool(flag.value)

    def get_scalar(self, sel: VolumeSelector) -> float | None:
        import ctypes
        from ctypes import byref, c_uint32

        if not self.has(sel):
            return None
        addr = _addr(self._hal, sel.selector, sel.scope, sel.element)
        value = ctypes.c_float(0)
        size = c_uint32(ctypes.sizeof(value))
        st = self._hal.ca.AudioObjectGetPropertyData(
            self._id, byref(addr), 0, None, byref(size), byref(value)
        )
        if st != 0:
            return None
        return float(value.value)

    def set_scalar(self, sel: VolumeSelector, value_0_1: float) -> bool:
        import ctypes
        from ctypes import byref, c_uint32

        if not self.has(sel) or not self._settable(sel):
            return False
        addr = _addr(self._hal, sel.selector, sel.scope, sel.element)
        value = ctypes.c_float(value_0_1)
        st = self._hal.ca.AudioObjectSetPropertyData(
            self._id,
            byref(addr),
            0,
            None,
            c_uint32(ctypes.sizeof(value)),
            byref(value),
        )
        return st == 0

    def set_mute(self, sel: VolumeSelector, muted: bool) -> bool:
        import ctypes
        from ctypes import byref, c_uint32

        if not self.has(sel) or not self._settable(sel):
            return False
        addr = _addr(self._hal, sel.selector, sel.scope, sel.element)
        value = c_uint32(1 if muted else 0)
        st = self._hal.ca.AudioObjectSetPropertyData(
            self._id,
            byref(addr),
            0,
            None,
            c_uint32(ctypes.sizeof(value)),
            byref(value),
        )
        return st == 0


def _device_has_output(hal: _Hal, dev_id: int) -> bool:
    from ctypes import byref, c_uint32

    addr = _addr(hal, SEL_STREAMS, SCOPE_OUTPUT)
    size = c_uint32(0)
    st = hal.ca.AudioObjectGetPropertyDataSize(
        dev_id, byref(addr), 0, None, byref(size)
    )
    return st == 0 and size.value > 0


def _resolve_audio_device_id(device_id: str) -> int | None:
    key = coreaudio_device_key(device_id)
    if not key:
        return None
    hal = _hal()
    if hal is None:
        return None
    import ctypes
    from ctypes import POINTER, c_uint32, cast, sizeof

    raw = _hal_get_bytes(hal, SYSTEM_OBJECT, SEL_DEVICES, SCOPE_GLOBAL)
    if raw is None:
        return None
    buf, size = raw
    n = size // sizeof(c_uint32)
    ids = cast(buf, POINTER(c_uint32))
    for i in range(n):
        audio_id = int(ids[i])
        if not _device_has_output(hal, audio_id):
            continue
        uid = _cfstring_from_prop(hal, audio_id, SEL_UID, SCOPE_GLOBAL) or ""
        name = _cfstring_from_prop(hal, audio_id, SEL_NAME, SCOPE_GLOBAL) or ""
        if match_device_key(
            device_id, uid=uid, numeric_id=audio_id, name=name
        ):
            return audio_id
    return None


def _set_hardware_volume(device_id: str, volume_0_100: float) -> bool:
    audio_id = _resolve_audio_device_id(device_id)
    if audio_id is None:
        return False
    return apply_hardware_volume(volume_0_100, _HalVolumeIO(audio_id))


def _get_hardware_volume(device_id: str) -> float | None:
    audio_id = _resolve_audio_device_id(device_id)
    if audio_id is None:
        return None
    return read_hardware_volume(_HalVolumeIO(audio_id))


def _list_devices_mpv_fallback() -> list[AudioDevice]:
    """Parse ``mpv --audio-device=help`` when Core Audio ctypes fails."""
    import re
    import shutil
    import subprocess

    mpv = shutil.which("mpv")
    if not mpv:
        return []
    try:
        proc = subprocess.run(
            [mpv, "--audio-device=help"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except Exception:
        return []
    text = (proc.stdout or "") + (proc.stderr or "")
    devices: list[AudioDevice] = []
    # 'coreaudio/BuiltInSpeakerDevice' (MacBook Pro Speakers)
    pat = re.compile(r"^\s*'(coreaudio/[^']+)'\s+\((.+)\)\s*$")
    for line in text.splitlines():
        m = pat.match(line)
        if not m:
            continue
        mpv_id, name = m.group(1), m.group(2)
        devices.append(
            AudioDevice(
                id=mpv_id,
                name=name,
                # Unknown caps: advertise full allowlist; formatPolicy still
                # intersects with exclusive-formats server catalog.
                sample_rates=list(EXCLUSIVE_RATES_HZ),
                bit_depths=list(EXCLUSIVE_DEPTHS),
                mpv_device=mpv_id,
            )
        )
    return devices


def _list_devices_coreaudio() -> list[AudioDevice]:
    from ctypes import (
        POINTER,
        Structure,
        c_double,
        c_uint32,
        cast,
        sizeof,
    )

    hal = _hal()
    if hal is None:
        return _list_devices_mpv_fallback()

    class AudioValueRange(Structure):
        _fields_ = [("mMinimum", c_double), ("mMaximum", c_double)]

    raw = _hal_get_bytes(hal, SYSTEM_OBJECT, SEL_DEVICES, SCOPE_GLOBAL)
    if raw is None:
        return _list_devices_mpv_fallback()
    buf, size = raw
    n = size // sizeof(c_uint32)
    ids = cast(buf, POINTER(c_uint32))

    devices: list[AudioDevice] = []
    for i in range(n):
        dev_id = int(ids[i])
        if not _device_has_output(hal, dev_id):
            continue

        name = _cfstring_from_prop(hal, dev_id, SEL_NAME, SCOPE_GLOBAL)
        if not name:
            name = f"Device {dev_id}"

        rates: set[int] = set()
        rraw = _hal_get_bytes(hal, dev_id, SEL_RATE_RANGES, SCOPE_OUTPUT)
        if rraw is not None:
            rbuf, rsize = rraw
            n_ranges = rsize // sizeof(AudioValueRange)
            ranges = cast(rbuf, POINTER(AudioValueRange))
            for j in range(n_ranges):
                lo = float(ranges[j].mMinimum)
                hi = float(ranges[j].mMaximum)
                for ar in EXCLUSIVE_RATES_HZ:
                    if lo - 0.5 <= ar <= hi + 0.5:
                        rates.add(ar)
        if not rates:
            from ctypes import byref

            rate_v = c_double(0)
            rsz = c_uint32(sizeof(c_double))
            addr = _addr(hal, SEL_NOMINAL_RATE, SCOPE_OUTPUT)
            st = hal.ca.AudioObjectGetPropertyData(
                dev_id, byref(addr), 0, None, byref(rsz), byref(rate_v)
            )
            if st == 0:
                nearest = min(
                    EXCLUSIVE_RATES_HZ,
                    key=lambda r: abs(r - rate_v.value),
                )
                if abs(nearest - rate_v.value) < 1.0:
                    rates.add(nearest)
            if not rates:
                rates = set(EXCLUSIVE_RATES_HZ)

        depths = list(EXCLUSIVE_DEPTHS)
        devices.append(
            AudioDevice(
                id=str(dev_id),
                name=name,
                sample_rates=sorted(rates),
                bit_depths=depths,
                mpv_device="",
            )
        )

    mpv_devs = _list_devices_mpv_fallback()
    if not mpv_devs:
        return [
            AudioDevice(
                id=d.id,
                name=d.name,
                sample_rates=d.sample_rates,
                bit_depths=d.bit_depths,
                mpv_device=f"coreaudio/{d.id}",
            )
            for d in devices
        ]

    ca_by_name = {d.name.lower(): d for d in devices}
    merged: list[AudioDevice] = []
    for md in mpv_devs:
        ca_hit = ca_by_name.get(md.name.lower())
        merged.append(
            AudioDevice(
                id=md.id,
                name=md.name,
                sample_rates=ca_hit.sample_rates if ca_hit else md.sample_rates,
                bit_depths=ca_hit.bit_depths if ca_hit else md.bit_depths,
                mpv_device=md.id,
            )
        )
    return merged
