"""Exclusive FLAC matrix + aresample policy."""

from musicweb.transcode.probe import SourceAudioTech
from musicweb.transcode.profiles import (
    EXCLUSIVE_DEPTHS,
    EXCLUSIVE_RATES_HZ,
    PROFILES,
    browser_codecs_payload,
    browser_profiles,
    exclusive_flac_profiles,
    exclusive_formats_payload,
    flac_tag,
    get_profile,
    plan_aresample,
)


def test_exclusive_matrix_is_complete_12():
    tags = [p.tag for p in exclusive_flac_profiles()]
    assert len(tags) == 12
    expected = {
        flac_tag(d, r) for r in EXCLUSIVE_RATES_HZ for d in EXCLUSIVE_DEPTHS
    }
    assert set(tags) == expected
    for tag in expected:
        p = get_profile(tag)
        assert p.kind == "flac"
        assert p.extension == "flac"


def test_browser_codecs_exclude_exclusive_only_tags():
    listed = {p.tag for p in browser_profiles()}
    assert "flac_16_44100" in listed
    assert "flac_16_48000" in listed
    assert "flac_24_96000" in listed
    assert "opus_192_48000" in listed
    assert "opus_96_48000" in listed
    assert "opus_64_48000" in listed
    # Exclusive-only cells must not appear on /api/codecs.
    assert "flac_24_192000" not in listed
    assert "flac_16_88200" not in listed
    assert "flac_24_176400" not in listed
    # But they remain resolvable.
    get_profile("flac_24_192000")
    for p in browser_profiles():
        assert p.approx_mb_per_hour is not None
    for tag in ("opus_96_48000", "opus_64_48000"):
        p = get_profile(tag)
        assert p.browser_listed is True
        assert p.kind == "opus"


def test_exclusive_formats_payload_shape():
    body = exclusive_formats_payload()
    assert "formats" in body
    assert len(body["formats"]) == 12
    row = body["formats"][0]
    assert set(row) == {"tag", "sample_rate", "bit_depth", "label"}


_APPROX_MB_PER_HOUR = {
    "opus_192_48000": 86,
    "opus_160_48000": 72,
    "opus_128_48000": 58,
    "opus_96_48000": 43,
    "opus_64_48000": 29,
    "flac_16_44100": 380,
    "flac_16_48000": 410,
    "flac_24_96000": 1230,
}


def test_browser_codecs_payload_includes_size_estimates():
    body = browser_codecs_payload()
    assert body["default"] == "opus_192_48000"
    rows = body["codecs"]
    assert [r["id"] for r in rows] == [
        "opus_192_48000",
        "opus_160_48000",
        "opus_128_48000",
        "opus_96_48000",
        "opus_64_48000",
        "flac_16_44100",
        "flac_16_48000",
        "flac_24_96000",
    ]
    codec_keys = {
        "id",
        "label",
        "kind",
        "media_type",
        "can_play",
        "bitrate_kbps",
        "bit_depth",
        "sample_rate",
        "approx_mb_per_hour",
    }
    for row in rows:
        assert set(row) == codec_keys
        assert row["approx_mb_per_hour"] == _APPROX_MB_PER_HOUR[row["id"]]
    assert "flac_24_192000" not in {r["id"] for r in rows}


def test_plan_aresample_perfect_match_skips():
    p = get_profile("flac_24_96000")
    src = SourceAudioTech(sample_rate_hz=96000, bit_depth=24)
    plan = plan_aresample(p, src)
    assert plan.filter is None
    assert plan.dither is False


def test_plan_aresample_depth_reduction_dithers():
    p = get_profile("flac_16_44100")
    src = SourceAudioTech(sample_rate_hz=96000, bit_depth=24)
    plan = plan_aresample(p, src)
    assert plan.filter is not None
    assert plan.dither is True
    assert "shibata" in plan.filter


def test_plan_aresample_up_depth_no_dither():
    p = get_profile("flac_24_48000")
    src = SourceAudioTech(sample_rate_hz=48000, bit_depth=16)
    plan = plan_aresample(p, src)
    assert plan.filter is not None
    assert plan.dither is False
    assert "shibata" not in plan.filter


def test_flac_encoder_args_include_stereo_downmix():
    p = get_profile("flac_24_192000")
    args = p.ffmpeg_codec_args()
    assert "-ac" in args
    assert args[args.index("-ac") + 1] == "2"


def test_all_profiles_in_registry():
    # 5 opus + 12 flac
    assert len(PROFILES) == 17
