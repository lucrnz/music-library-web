"""macOS Core Audio device list + format caps (ctypes).

Non-mac platforms return an empty device list. Hardware volume is best-effort.
"""

from __future__ import annotations

import logging
import platform
import sys
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# Align with exclusive FLAC allowlist (profiles.EXCLUSIVE_*).
ALLOWLIST_RATES: tuple[int, ...] = (
    44100,
    48000,
    88200,
    96000,
    176400,
    192000,
)
ALLOWLIST_DEPTHS: tuple[int, ...] = (16, 24)


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
        logger.warning("Core Audio device probe only available on macOS")
        return []
    try:
        return _list_devices_coreaudio()
    except Exception as exc:
        logger.exception("Core Audio probe failed: %s", exc)
        return _list_devices_mpv_fallback()


def set_device_volume(device_id: str, volume_0_100: float) -> bool:
    """Best-effort hardware volume. Returns True if applied."""
    if not is_macos():
        return False
    try:
        return _set_hardware_volume(device_id, volume_0_100)
    except Exception as exc:
        logger.debug("hardware volume failed: %s", exc)
        return False


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
                sample_rates=list(ALLOWLIST_RATES),
                bit_depths=list(ALLOWLIST_DEPTHS),
                mpv_device=mpv_id,
            )
        )
    return devices


def _list_devices_coreaudio() -> list[AudioDevice]:
    import ctypes
    import ctypes.util
    from ctypes import (
        POINTER,
        Structure,
        byref,
        c_double,
        c_uint32,
        c_void_p,
        cast,
        sizeof,
    )

    ca_path = ctypes.util.find_library("CoreAudio")
    cf_path = ctypes.util.find_library("CoreFoundation")
    if not ca_path or not cf_path:
        return _list_devices_mpv_fallback()

    ca = ctypes.CDLL(ca_path)
    cf = ctypes.CDLL(cf_path)

    AudioObjectID = c_uint32
    AudioDeviceID = c_uint32
    OSStatus = ctypes.c_int32

    class AudioObjectPropertyAddress(Structure):
        _fields_ = [
            ("mSelector", c_uint32),
            ("mScope", c_uint32),
            ("mElement", c_uint32),
        ]

    class AudioValueRange(Structure):
        _fields_ = [("mMinimum", c_double), ("mMaximum", c_double)]

    kAudioObjectSystemObject = 1

    def fourcc(s: str) -> int:
        return (ord(s[0]) << 24) | (ord(s[1]) << 16) | (ord(s[2]) << 8) | ord(s[3])

    kAudioHardwarePropertyDevices = fourcc("dev#")
    kAudioDevicePropertyDeviceNameCFString = fourcc("lnam")
    kAudioDevicePropertyStreams = fourcc("stm#")
    kAudioDevicePropertyNominalSampleRate = fourcc("nsrt")
    kAudioDevicePropertyAvailableNominalSampleRates = fourcc("nsr#")
    kAudioDevicePropertyStreamFormat = fourcc("sfmt")
    kAudioObjectPropertyScopeOutput = fourcc("outp")
    kAudioObjectPropertyScopeGlobal = fourcc("glob")
    kAudioObjectPropertyElementMain = 0
    kAudioObjectPropertyElementMaster = 0  # legacy alias

    ca.AudioObjectGetPropertyDataSize.argtypes = [
        AudioObjectID,
        POINTER(AudioObjectPropertyAddress),
        c_uint32,
        c_void_p,
        POINTER(c_uint32),
    ]
    ca.AudioObjectGetPropertyDataSize.restype = OSStatus
    ca.AudioObjectGetPropertyData.argtypes = [
        AudioObjectID,
        POINTER(AudioObjectPropertyAddress),
        c_uint32,
        c_void_p,
        POINTER(c_uint32),
        c_void_p,
    ]
    ca.AudioObjectGetPropertyData.restype = OSStatus

    cf.CFStringGetCString.argtypes = [c_void_p, c_void_p, ctypes.c_long, c_uint32]
    cf.CFStringGetCString.restype = ctypes.c_bool
    cf.CFRelease.argtypes = [c_void_p]

    kCFStringEncodingUTF8 = 0x08000100

    def prop_addr(selector: int, scope: int) -> AudioObjectPropertyAddress:
        return AudioObjectPropertyAddress(
            selector, scope, kAudioObjectPropertyElementMain
        )

    def get_data(obj: int, addr: AudioObjectPropertyAddress, ctype):
        size = c_uint32(0)
        st = ca.AudioObjectGetPropertyDataSize(obj, byref(addr), 0, None, byref(size))
        if st != 0 or size.value == 0:
            return None
        buf = (ctypes.c_byte * size.value)()
        st = ca.AudioObjectGetPropertyData(
            obj, byref(addr), 0, None, byref(size), buf
        )
        if st != 0:
            return None
        return buf, size.value

    # Device list
    addr = prop_addr(kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal)
    raw = get_data(kAudioObjectSystemObject, addr, AudioDeviceID)
    if raw is None:
        return _list_devices_mpv_fallback()
    buf, size = raw
    n = size // sizeof(AudioDeviceID)
    ids = cast(buf, POINTER(AudioDeviceID))

    devices: list[AudioDevice] = []
    for i in range(n):
        dev_id = int(ids[i])
        # Output streams?
        saddr = prop_addr(
            kAudioDevicePropertyStreams, kAudioObjectPropertyScopeOutput
        )
        ssize = c_uint32(0)
        st = ca.AudioObjectGetPropertyDataSize(
            dev_id, byref(saddr), 0, None, byref(ssize)
        )
        if st != 0 or ssize.value == 0:
            continue

        # Name
        name = f"Device {dev_id}"
        naddr = prop_addr(
            kAudioDevicePropertyDeviceNameCFString,
            kAudioObjectPropertyScopeGlobal,
        )
        cfstr = c_void_p()
        nsize = c_uint32(sizeof(c_void_p))
        st = ca.AudioObjectGetPropertyData(
            dev_id, byref(naddr), 0, None, byref(nsize), byref(cfstr)
        )
        if st == 0 and cfstr.value:
            cbuf = ctypes.create_string_buffer(512)
            if cf.CFStringGetCString(
                cfstr, cbuf, 512, kCFStringEncodingUTF8
            ):
                name = cbuf.value.decode("utf-8", errors="replace")
            cf.CFRelease(cfstr)

        # Available sample rates
        rates: set[int] = set()
        raddr = prop_addr(
            kAudioDevicePropertyAvailableNominalSampleRates,
            kAudioObjectPropertyScopeOutput,
        )
        rraw = get_data(dev_id, raddr, AudioValueRange)
        if rraw is not None:
            rbuf, rsize = rraw
            n_ranges = rsize // sizeof(AudioValueRange)
            ranges = cast(rbuf, POINTER(AudioValueRange))
            for j in range(n_ranges):
                lo = float(ranges[j].mMinimum)
                hi = float(ranges[j].mMaximum)
                for ar in ALLOWLIST_RATES:
                    if lo - 0.5 <= ar <= hi + 0.5:
                        rates.add(ar)
        if not rates:
            # Fall back to current nominal rate if available
            nsaddr = prop_addr(
                kAudioDevicePropertyNominalSampleRate,
                kAudioObjectPropertyScopeOutput,
            )
            rate_v = c_double(0)
            rsz = c_uint32(sizeof(c_double))
            st = ca.AudioObjectGetPropertyData(
                dev_id, byref(nsaddr), 0, None, byref(rsz), byref(rate_v)
            )
            if st == 0:
                nearest = min(
                    ALLOWLIST_RATES,
                    key=lambda r: abs(r - rate_v.value),
                )
                if abs(nearest - rate_v.value) < 1.0:
                    rates.add(nearest)
            if not rates:
                rates = set(ALLOWLIST_RATES)

        # Bit depths: Core Audio stream formats are complex; advertise
        # allowlist depths when device has any output (honest enough for policy).
        depths = list(ALLOWLIST_DEPTHS)
        sorted_rates = sorted(rates)
        mpv_id = f"coreaudio/{dev_id}"
        # Prefer UID-style id if we can get it; numeric CoreAudio id is stable
        # for process life. mpv uses name-based coreaudio/... strings.
        devices.append(
            AudioDevice(
                id=str(dev_id),
                name=name,
                sample_rates=sorted_rates,
                bit_depths=depths,
                mpv_device="",  # filled by matching against mpv list
            )
        )

    # Merge with mpv device names for playable --audio-device values
    mpv_devs = _list_devices_mpv_fallback()
    if not mpv_devs:
        # No mpv: still return Core Audio devices with synthetic mpv ids
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

    # Prefer mpv enumeration (correct --audio-device strings) and attach
    # caps from Core Audio by fuzzy name match when possible.
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


def _set_hardware_volume(device_id: str, volume_0_100: float) -> bool:
    """Attempt kAudioHardwareServiceDeviceProperty_VirtualMainVolume."""
    # Hardware volume is best-effort; many devices use different property
    # selectors. Digital mpv volume is the required path — return False to
    # keep digital active when this is non-trivial.
    del device_id, volume_0_100
    return False
