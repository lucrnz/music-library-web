from musicweb.exclusive.coreaudio import AudioDevice, merge_output_devices
from musicweb.exclusive.wasapi import (
    attach_caps,
    caps_from_exclusive_probes,
    mix_fallback_caps,
    parse_mpv_wasapi_help,
    scalar_from_volume,
    volume_from_scalar,
    wasapi_device_key,
)
from musicweb.transcode.profiles import EXCLUSIVE_DEPTHS, EXCLUSIVE_RATES_HZ


def test_wasapi_device_key_strips_prefix():
    assert wasapi_device_key("wasapi/{abc}") == "{abc}"
    assert wasapi_device_key("WASAPI/{abc}") == "{abc}"
    assert wasapi_device_key("{abc}") == "{abc}"


def test_parse_mpv_wasapi_help():
    text = """
List of detected audio devices:
  'auto' (Autoselect device)
  'wasapi/{a722f9c6-40a5-4087-922b-c0d27f70ea2f}' (Speakers (High Definition Audio Device))
  'coreaudio/BuiltInSpeakerDevice' (MacBook Pro Speakers)
"""
    devices = parse_mpv_wasapi_help(text)
    assert len(devices) == 1
    assert devices[0].id == "wasapi/{a722f9c6-40a5-4087-922b-c0d27f70ea2f}"
    assert devices[0].name.startswith("Speakers")
    assert devices[0].mpv_device == devices[0].id
    assert devices[0].sample_rates == []
    assert devices[0].bit_depths == []


def test_caps_from_exclusive_probes_intersect_allowlist():
    supported = {
        (44100, 16),
        (48000, 16),
        (192000, 24),
        (32000, 16),  # not allowlisted
        (44100, 32),  # not allowlisted
    }
    rates, depths = caps_from_exclusive_probes(supported)
    assert rates == [44100, 48000, 192000]
    assert depths == [16, 24]
    assert set(rates) <= set(EXCLUSIVE_RATES_HZ)
    assert set(depths) <= set(EXCLUSIVE_DEPTHS)


def test_empty_probes_use_mix_fallback_not_full_allowlist():
    rates, depths = mix_fallback_caps(48000, 16)
    assert rates == [48000]
    assert depths == [16]
    assert len(rates) * len(depths) < len(EXCLUSIVE_RATES_HZ) * len(EXCLUSIVE_DEPTHS)


def test_mix_fallback_drops_unknown_rate_or_depth():
    assert mix_fallback_caps(32000, 16) == ([], [16])
    assert mix_fallback_caps(48000, 32) == ([48000], [])
    assert mix_fallback_caps(None, None) == ([], [])


def test_merge_prefers_mpv_wasapi_ids():
    native = [
        AudioDevice(
            id="wasapi/{aaaa}",
            name="Speakers",
            sample_rates=[44100, 48000],
            bit_depths=[16],
            mpv_device="wasapi/{aaaa}",
        )
    ]
    mpv = [
        AudioDevice(
            id="wasapi/{aaaa}",
            name="Speakers (High Definition Audio Device)",
            sample_rates=[],
            bit_depths=[],
            mpv_device="wasapi/{aaaa}",
        )
    ]
    merged = merge_output_devices(native, mpv)
    assert len(merged) == 1
    assert merged[0].id == "wasapi/{aaaa}"
    assert merged[0].mpv_device == "wasapi/{aaaa}"
    assert merged[0].sample_rates == [44100, 48000]
    assert merged[0].bit_depths == [16]


def test_volume_scalar_roundtrip():
    assert volume_from_scalar(0.25) == 25.0
    assert scalar_from_volume(80) == 0.8
    assert volume_from_scalar(2.0) == 100.0
    assert scalar_from_volume(-5) == 0.0


def test_attach_caps_does_not_invent_full_catalog():
    parsed = parse_mpv_wasapi_help(
        "  'wasapi/{abc}' (Speakers)\n"
    )
    rates, depths = mix_fallback_caps(44100, 16)
    out = attach_caps(parsed, rates=rates, depths=depths)
    assert out[0].sample_rates == [44100]
    assert out[0].bit_depths == [16]
    assert out[0].sample_rates != list(EXCLUSIVE_RATES_HZ)
