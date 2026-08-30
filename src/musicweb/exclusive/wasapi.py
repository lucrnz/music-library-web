"""Windows WASAPI device list, exclusive format caps, and endpoint volume.

Non-Windows callers use the pure helpers and parsers. Live COM runs only on
win32. No third-party packages.
"""

from __future__ import annotations

import logging
import re
import shutil
import sys
from typing import Any

from musicweb.exclusive.coreaudio import AudioDevice, merge_output_devices
from musicweb.runtime.spawn import run
from musicweb.transcode.profiles import EXCLUSIVE_DEPTHS, EXCLUSIVE_RATES_HZ

logger = logging.getLogger(__name__)

_MPV_WASAPI_LINE = re.compile(r"^\s*'(wasapi/[^']+)'\s+\((.+)\)\s*$")


def wasapi_device_key(device_id: str) -> str:
    """Strip the ``wasapi/`` prefix from an mpv device id."""
    s = (device_id or "").strip()
    prefix = "wasapi/"
    if s.lower().startswith(prefix):
        return s[len(prefix) :]
    return s


def parse_mpv_wasapi_help(text: str) -> list[AudioDevice]:
    """Parse ``mpv --audio-device=help`` lines that name ``wasapi/`` devices."""
    devices: list[AudioDevice] = []
    for line in (text or "").splitlines():
        m = _MPV_WASAPI_LINE.match(line)
        if not m:
            continue
        mpv_id, name = m.group(1), m.group(2)
        devices.append(
            AudioDevice(
                id=mpv_id,
                name=name,
                sample_rates=[],
                bit_depths=[],
                mpv_device=mpv_id,
            )
        )
    return devices


def caps_from_exclusive_probes(
    supported: set[tuple[int, int]],
) -> tuple[list[int], list[int]]:
    """Intersect probed (rate, depth) pairs with the exclusive allowlist."""
    rates: set[int] = set()
    depths: set[int] = set()
    allow_r = set(EXCLUSIVE_RATES_HZ)
    allow_d = set(EXCLUSIVE_DEPTHS)
    for rate, depth in supported:
        if rate in allow_r and depth in allow_d:
            rates.add(rate)
            depths.add(depth)
    return sorted(rates), sorted(depths)


def mix_fallback_caps(
    mix_rate: int | None, mix_depth: int | None
) -> tuple[list[int], list[int]]:
    """When exclusive probes are empty, advertise the mix format ∩ allowlist."""
    rates: list[int] = []
    depths: list[int] = []
    if mix_rate in EXCLUSIVE_RATES_HZ:
        rates = [int(mix_rate)]
    if mix_depth in EXCLUSIVE_DEPTHS:
        depths = [int(mix_depth)]
    return rates, depths


def volume_from_scalar(scalar_0_1: float) -> float:
    return max(0.0, min(100.0, float(scalar_0_1) * 100.0))


def scalar_from_volume(volume_0_100: float) -> float:
    return max(0.0, min(1.0, float(volume_0_100) / 100.0))


def attach_caps(
    devices: list[AudioDevice],
    *,
    rates: list[int],
    depths: list[int],
) -> list[AudioDevice]:
    return [
        AudioDevice(
            id=d.id,
            name=d.name,
            sample_rates=list(rates),
            bit_depths=list(depths),
            mpv_device=d.mpv_device or d.id,
        )
        for d in devices
    ]


def _mpv_wasapi_devices() -> list[AudioDevice]:
    mpv = shutil.which("mpv")
    if not mpv:
        return []
    try:
        proc = run(
            [mpv, "--audio-device=help"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except Exception:
        return []
    return parse_mpv_wasapi_help((proc.stdout or "") + (proc.stderr or ""))


def list_wasapi_devices() -> list[AudioDevice]:
    """Enumerate WASAPI render endpoints merged with mpv ``wasapi/`` ids."""
    if sys.platform != "win32":
        return []
    try:
        native = _enumerate_endpoints()
    except Exception:
        logger.exception("WASAPI enumerate failed")
        native = []
    mpv = _mpv_wasapi_devices()
    if not mpv and not native:
        return []
    if not mpv:
        return native
    if not native:
        return mpv
    return merge_output_devices(native, mpv)


def get_wasapi_volume(device_id: str) -> float | None:
    if sys.platform != "win32":
        return None
    try:
        scalar = _endpoint_volume_scalar(device_id, write=None)
    except Exception:
        logger.debug("WASAPI volume read failed", exc_info=True)
        return None
    if scalar is None:
        return None
    return volume_from_scalar(scalar)


def set_wasapi_volume(device_id: str, volume_0_100: float) -> bool:
    if sys.platform != "win32":
        return False
    try:
        ok = _endpoint_volume_scalar(device_id, write=scalar_from_volume(volume_0_100))
    except Exception:
        logger.debug("WASAPI volume write failed", exc_info=True)
        return False
    return bool(ok)


# --- COM (win32 only) -------------------------------------------------------


_GUID_CLS: Any = None


def _guid_cls() -> Any:
    global _GUID_CLS
    if _GUID_CLS is None:
        import ctypes

        class GUID(ctypes.Structure):
            _fields_ = [
                ("Data1", ctypes.c_uint32),
                ("Data2", ctypes.c_uint16),
                ("Data3", ctypes.c_uint16),
                ("Data4", ctypes.c_ubyte * 8),
            ]

        _GUID_CLS = GUID
    return _GUID_CLS


def _guid(text: str) -> Any:
    import ctypes

    hexed = text.strip("{}").replace("-", "")
    data4 = (ctypes.c_ubyte * 8)(
        *[int(hexed[16 + i : 18 + i], 16) for i in range(0, 16, 2)]
    )
    return _guid_cls()(
        int(hexed[0:8], 16),
        int(hexed[8:12], 16),
        int(hexed[12:16], 16),
        data4,
    )


def _vtbl_fn(obj: Any, index: int, restype: Any, *argtypes: Any) -> Any:
    import ctypes

    vtbl = ctypes.cast(obj, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)))[0]
    proto = ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *argtypes)
    return proto(vtbl[index])


def _co_init() -> None:
    import ctypes

    ole32 = ctypes.windll.ole32
    hr = ole32.CoInitializeEx(None, 0x0)  # COINIT_MULTITHREADED
    # S_OK, S_FALSE (already init), RPC_E_CHANGED_MODE
    if hr not in (0, 1, 0x80010106):
        logger.debug("CoInitializeEx hr=0x%08x", hr & 0xFFFFFFFF)


def _release(obj: Any) -> None:
    if not obj:
        return
    import ctypes

    try:
        _vtbl_fn(obj, 2, ctypes.c_ulong)(obj)
    except Exception:
        pass


def _pcm_format(rate: int, depth: int, channels: int = 2) -> Any:
    import ctypes

    class WAVEFORMATEX(ctypes.Structure):
        _fields_ = [
            ("wFormatTag", ctypes.c_uint16),
            ("nChannels", ctypes.c_uint16),
            ("nSamplesPerSec", ctypes.c_uint32),
            ("nAvgBytesPerSec", ctypes.c_uint32),
            ("nBlockAlign", ctypes.c_uint16),
            ("wBitsPerSample", ctypes.c_uint16),
            ("cbSize", ctypes.c_uint16),
        ]

    block = channels * (depth // 8)
    fmt = WAVEFORMATEX()
    fmt.wFormatTag = 1  # WAVE_FORMAT_PCM
    fmt.nChannels = channels
    fmt.nSamplesPerSec = rate
    fmt.wBitsPerSample = depth
    fmt.nBlockAlign = block
    fmt.nAvgBytesPerSec = rate * block
    fmt.cbSize = 0
    return fmt


def _enumerate_endpoints() -> list[AudioDevice]:
    import ctypes
    from ctypes import POINTER, byref, c_uint32, c_void_p, c_wchar_p

    _co_init()
    ole32 = ctypes.windll.ole32
    enumerator = c_void_p()
    clsid = _guid("BCDE0395-E52F-467C-8E3D-C4579291692E")
    iid_enum = _guid("A95664D2-9614-4F35-A746-DE8DB63617E6")
    hr = ole32.CoCreateInstance(
        byref(clsid), None, 1, byref(iid_enum), byref(enumerator)
    )  # CLSCTX_INPROC_SERVER
    if hr != 0 or not enumerator:
        raise OSError(f"CoCreateInstance MMDeviceEnumerator hr=0x{hr & 0xFFFFFFFF:08x}")

    devices: list[AudioDevice] = []
    collection = c_void_p()
    try:
        # IMMDeviceEnumerator::EnumAudioEndpoints (vtbl 3)
        hr = _vtbl_fn(
            enumerator, 3, ctypes.c_long, ctypes.c_int, ctypes.c_uint32, POINTER(c_void_p)
        )(enumerator, 0, 1, byref(collection))  # eRender, DEVICE_STATE_ACTIVE
        if hr != 0 or not collection:
            return []
        count = c_uint32(0)
        # IMMDeviceCollection::GetCount (vtbl 3)
        _vtbl_fn(collection, 3, ctypes.c_long, POINTER(c_uint32))(
            collection, byref(count)
        )
        for i in range(int(count.value)):
            dev = c_void_p()
            # IMMDeviceCollection::Item (vtbl 4)
            hr = _vtbl_fn(collection, 4, ctypes.c_long, c_uint32, POINTER(c_void_p))(
                collection, i, byref(dev)
            )
            if hr != 0 or not dev:
                continue
            try:
                parsed = _device_from_immdevice(dev)
                if parsed is not None:
                    devices.append(parsed)
            finally:
                _release(dev)
    finally:
        _release(collection)
        _release(enumerator)
    return devices


def _device_from_immdevice(dev: Any) -> AudioDevice | None:
    import ctypes
    from ctypes import POINTER, byref, c_void_p, c_wchar_p

    wid = c_wchar_p()
    # IMMDevice::GetId (vtbl 5)
    hr = _vtbl_fn(dev, 5, ctypes.c_long, POINTER(c_wchar_p))(dev, byref(wid))
    if hr != 0 or not wid.value:
        return None
    endpoint_id = wid.value
    ctypes.windll.ole32.CoTaskMemFree(wid)
    name = _friendly_name(dev) or endpoint_id
    guid = _guid_from_endpoint(endpoint_id)
    mpv_id = f"wasapi/{{{guid}}}" if guid else f"wasapi/{endpoint_id}"
    rates, depths = _probe_caps(dev)
    return AudioDevice(
        id=mpv_id,
        name=name,
        sample_rates=rates,
        bit_depths=depths,
        mpv_device=mpv_id,
    )


def _guid_from_endpoint(endpoint_id: str) -> str:
    # "{0.0.0.00000000}.{a722f9c6-40a5-4087-922b-c0d27f70ea2f}"
    if "." in endpoint_id:
        tail = endpoint_id.rsplit(".", 1)[-1].strip("{}")
        if "-" in tail:
            return tail.lower()
    s = endpoint_id.strip("{}")
    return s.lower()


def _friendly_name(dev: Any) -> str:
    import ctypes
    from ctypes import POINTER, byref, c_void_p

    store = c_void_p()
    # IMMDevice::OpenPropertyStore (vtbl 4) STGM_READ = 0
    hr = _vtbl_fn(dev, 4, ctypes.c_long, ctypes.c_uint32, POINTER(c_void_p))(
        dev, 0, byref(store)
    )
    if hr != 0 or not store:
        return ""
    try:
        class PROPERTYKEY(ctypes.Structure):
            _fields_ = [("fmtid", _guid_cls()), ("pid", ctypes.c_uint32)]

        class PROPVARIANT(ctypes.Structure):
            _fields_ = [
                ("vt", ctypes.c_uint16),
                ("wReserved1", ctypes.c_uint16),
                ("wReserved2", ctypes.c_uint16),
                ("wReserved3", ctypes.c_uint16),
                ("pwszVal", ctypes.c_wchar_p),
            ]

        key = PROPERTYKEY()
        key.fmtid = _guid("A45C254E-DF1C-4EFD-8020-67D146A850E0")
        key.pid = 14  # PKEY_Device_FriendlyName
        prop = PROPVARIANT()
        # IPropertyStore::GetValue (vtbl 5)
        hr = _vtbl_fn(store, 5, ctypes.c_long, POINTER(PROPERTYKEY), POINTER(PROPVARIANT))(
            store, byref(key), byref(prop)
        )
        if hr != 0 or not prop.pwszVal:
            return ""
        name = prop.pwszVal
        ctypes.windll.ole32.PropVariantClear(byref(prop))
        return name
    except Exception:
        return ""
    finally:
        _release(store)


def _activate(dev: Any, iid_text: str) -> Any:
    import ctypes
    from ctypes import POINTER, byref, c_void_p

    iid = _guid(iid_text)
    out = c_void_p()
    # IMMDevice::Activate (vtbl 3)
    hr = _vtbl_fn(
        dev,
        3,
        ctypes.c_long,
        ctypes.c_void_p,
        ctypes.c_uint32,
        c_void_p,
        POINTER(c_void_p),
    )(dev, ctypes.byref(iid), 1, None, byref(out))
    if hr != 0 or not out:
        return None
    return out


def _probe_caps(dev: Any) -> tuple[list[int], list[int]]:
    import ctypes
    from ctypes import POINTER, byref, c_void_p

    client = _activate(dev, "1CB9AD4C-DBFA-4c32-B178-C2F568A703B2")
    if not client:
        return [], []
    supported: set[tuple[int, int]] = set()
    mix_rate: int | None = None
    mix_depth: int | None = None
    try:
        mix_ptr = c_void_p()
        # IAudioClient::GetMixFormat (vtbl 8)
        hr = _vtbl_fn(client, 8, ctypes.c_long, POINTER(c_void_p))(
            client, byref(mix_ptr)
        )
        if hr == 0 and mix_ptr:

            class WAVEFORMATEX(ctypes.Structure):
                _fields_ = [
                    ("wFormatTag", ctypes.c_uint16),
                    ("nChannels", ctypes.c_uint16),
                    ("nSamplesPerSec", ctypes.c_uint32),
                    ("nAvgBytesPerSec", ctypes.c_uint32),
                    ("nBlockAlign", ctypes.c_uint16),
                    ("wBitsPerSample", ctypes.c_uint16),
                    ("cbSize", ctypes.c_uint16),
                ]

            mix = ctypes.cast(mix_ptr, POINTER(WAVEFORMATEX)).contents
            mix_rate = int(mix.nSamplesPerSec)
            mix_depth = int(mix.wBitsPerSample)
            ctypes.windll.ole32.CoTaskMemFree(mix_ptr)

        # IAudioClient::IsFormatSupported (vtbl 7)
        is_fmt = _vtbl_fn(
            client, 7, ctypes.c_long, ctypes.c_int, ctypes.c_void_p, POINTER(c_void_p)
        )
        for rate in EXCLUSIVE_RATES_HZ:
            for depth in EXCLUSIVE_DEPTHS:
                fmt = _pcm_format(rate, depth)
                closest = c_void_p()
                hr = is_fmt(client, 1, ctypes.byref(fmt), byref(closest))  # exclusive
                if closest:
                    ctypes.windll.ole32.CoTaskMemFree(closest)
                if hr == 0:
                    supported.add((rate, depth))
    finally:
        _release(client)

    rates, depths = caps_from_exclusive_probes(supported)
    if rates and depths:
        return rates, depths
    return mix_fallback_caps(mix_rate, mix_depth)


def _endpoint_for_key(key: str) -> Any | None:
    """Return an IMMDevice matching *key* (guid or full id). Caller releases."""
    import ctypes
    from ctypes import POINTER, byref, c_void_p, c_wchar_p

    _co_init()
    ole32 = ctypes.windll.ole32
    enumerator = c_void_p()
    clsid = _guid("BCDE0395-E52F-467C-8E3D-C4579291692E")
    iid_enum = _guid("A95664D2-9614-4F35-A746-DE8DB63617E6")
    hr = ole32.CoCreateInstance(
        byref(clsid), None, 1, byref(iid_enum), byref(enumerator)
    )
    if hr != 0 or not enumerator:
        return None
    try:
        needle = key.strip("{}").lower()
        collection = c_void_p()
        hr = _vtbl_fn(
            enumerator, 3, ctypes.c_long, ctypes.c_int, ctypes.c_uint32, POINTER(c_void_p)
        )(enumerator, 0, 1, byref(collection))
        if hr != 0 or not collection:
            return None
        try:
            count = ctypes.c_uint32(0)
            _vtbl_fn(collection, 3, ctypes.c_long, POINTER(ctypes.c_uint32))(
                collection, byref(count)
            )
            for i in range(int(count.value)):
                dev = c_void_p()
                hr = _vtbl_fn(collection, 4, ctypes.c_long, ctypes.c_uint32, POINTER(c_void_p))(
                    collection, i, byref(dev)
                )
                if hr != 0 or not dev:
                    continue
                wid = c_wchar_p()
                _vtbl_fn(dev, 5, ctypes.c_long, POINTER(c_wchar_p))(dev, byref(wid))
                eid = (wid.value or "") if wid else ""
                if wid:
                    ole32.CoTaskMemFree(wid)
                guid = _guid_from_endpoint(eid)
                if needle in eid.lower() or needle == guid or needle == guid.strip("{}"):
                    return dev
                _release(dev)
        finally:
            _release(collection)
    finally:
        _release(enumerator)
    return None


def _endpoint_volume_scalar(device_id: str, *, write: float | None) -> float | bool | None:
    import ctypes
    from ctypes import POINTER, byref, c_float

    key = wasapi_device_key(device_id)
    if key.startswith("{") and key.endswith("}") and "." not in key:
        key = key.strip("{}")
    dev = _endpoint_for_key(key)
    if not dev:
        return None if write is None else False
    try:
        vol = _activate(dev, "5CDF2C82-841E-4546-9722-0CF74078229A")
        if not vol:
            return None if write is None else False
        try:
            if write is None:
                out = c_float()
                # IAudioEndpointVolume::GetMasterVolumeLevelScalar (vtbl 9)
                hr = _vtbl_fn(vol, 9, ctypes.c_long, POINTER(c_float))(vol, byref(out))
                if hr != 0:
                    return None
                return float(out.value)
            # IAudioEndpointVolume::SetMasterVolumeLevelScalar (vtbl 7)
            hr = _vtbl_fn(vol, 7, ctypes.c_long, c_float, ctypes.c_void_p)(
                vol, c_float(write), None
            )
            return hr == 0
        finally:
            _release(vol)
    finally:
        _release(dev)
