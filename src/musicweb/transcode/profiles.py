"""Stream product profiles + pure encode policy (argv fragments, aresample).

High-quality rate/bit-depth conversion uses libsoxr through aresample at
SoX "very high quality" equivalents (``rate -v -L``):
  - precision=28 ≈ SoX ``rate -v``
  - linear phase ≈ SoX ``-L`` (libsoxr default; not exposed in ffmpeg)
  - cutoff=0.95 (SoX VHQ ~95% bandwidth; ffmpeg soxr default is ~0.91)
  - dither_method=shibata ≈ SoX ``dither -s`` **only when reducing bit depth**
    (source bits > profile bits). Never dither when increasing bit depth
    (e.g. 16→24). Perfect rate+depth match skips aresample entirely.

Exclusive FLAC allowlist (``flac_{depth}_{rate}``) is the full 12-cell matrix.
Browser-listed profiles stay the smaller marketing set for ``GET /api/codecs``.
"""

from __future__ import annotations

from dataclasses import dataclass

from musicweb.transcode.probe import SourceAudioTech

DEFAULT_PROFILE_TAG = "opus_192_48000"

# Exclusive FLAC allowlist rates × depths (grammar: flac_{depth}_{rate}).
EXCLUSIVE_RATES_HZ: tuple[int, ...] = (
    44100,
    48000,
    88200,
    96000,
    176400,
    192000,
)
EXCLUSIVE_DEPTHS: tuple[int, ...] = (16, 24)

# MIME strings for HTMLMediaElement.canPlayType() on the client.
_CAN_PLAY_OPUS = 'audio/ogg; codecs="opus"'
_CAN_PLAY_FLAC = "audio/flac"

# SoX rate -v -L via libsoxr. Shibata dither only when reducing bit depth.
_ARESAMPLE_HQ = (
    "aresample=resampler=soxr:precision=28:cutoff=0.95:dither_method=shibata"
)
_ARESAMPLE_HQ_NO_DITHER = (
    "aresample=resampler=soxr:precision=28:cutoff=0.95"
)


@dataclass(frozen=True)
class StreamProfile:
    """Product stream profile (format intent)."""

    tag: str
    sample_rate: int
    bitrate_kbps: int  # unused (0) for lossless FLAC
    extension: str
    media_type: str
    kind: str  # "opus" | "flac"
    label: str  # short UI label
    bit_depth: int  # 16 or 24 (PCM width fed to the encoder)
    can_play: str  # MIME probe string for browser capability checks
    # True → listed on GET /api/codecs (browser streaming UI).
    # False → resolvable via get_profile / stream / prepare only.
    browser_listed: bool = True
    # Product size constant for Settings (decimal MB/hour). Browser-listed
    # only; exclusive-only FLAC stays None and is not serialized.
    approx_mb_per_hour: int | None = None

    def sample_fmt(self) -> str:
        """PCM sample format for this profile's encoder + bit depth."""
        if self.kind == "flac":
            # FLAC: s16 or s32 (+ bits_per_raw_sample for true 24-bit).
            return "s32" if self.bit_depth >= 24 else "s16"
        # Lossy codecs (Opus): 16-bit intermediate is standard.
        return "s16"

    def encoder_label(self) -> str:
        if self.kind == "opus":
            return "libopus"
        return "flac"

    def ffmpeg_codec_args(self) -> list[str]:
        """Encoder-specific ffmpeg argv after shared -sample_fmt / -ar / -vn."""
        if self.kind == "opus":
            return [
                "-c:a",
                "libopus",
                "-b:a",
                f"{self.bitrate_kbps}k",
                "-vbr",
                "on",
            ]
        if self.kind == "flac":
            # Stereo product intent: downmix multi-channel sources once here.
            args = ["-ac", "2", "-c:a", "flac"]
            if self.bit_depth >= 24:
                args.extend(["-bits_per_raw_sample", "24"])
            return args
        raise ValueError(f"Unknown profile kind: {self.kind}")

    def ffmpeg_container_format(self) -> str:
        if self.kind == "opus":
            return "opus"
        if self.kind == "flac":
            return "flac"
        raise ValueError(f"Unknown profile kind: {self.kind}")


@dataclass(frozen=True)
class AresamplePlan:
    """Pure resample/dither decision for one encode.

    ``filter`` is None when rate+depth already match (skip aresample).
    ``dither`` is True only when the filter includes Shibata dither.
    """

    filter: str | None
    dither: bool


def plan_aresample(
    profile: StreamProfile,
    source: SourceAudioTech | None,
) -> AresamplePlan:
    """Decide whether to resample/dither for ``profile`` given source tech.

    Policy (unchanged from pre-extract worker rules):
      - Perfect rate+depth match → no filter
      - Source bits > profile bits → soxr + Shibata dither
      - Unknown bits → 16-bit target → dither (conservative)
      - Else (rate change, same/up depth, unknown→24) → soxr without dither
    """
    src_rate = source.sample_rate_hz if source else None
    src_bits = source.bit_depth if source else None
    tgt_rate = profile.sample_rate
    tgt_bits = profile.bit_depth

    if (
        src_rate is not None
        and src_bits is not None
        and src_rate == tgt_rate
        and src_bits == tgt_bits
    ):
        return AresamplePlan(filter=None, dither=False)

    if src_bits is not None and src_bits > tgt_bits:
        return AresamplePlan(filter=_ARESAMPLE_HQ, dither=True)

    if src_bits is None and tgt_bits <= 16:
        return AresamplePlan(filter=_ARESAMPLE_HQ, dither=True)

    return AresamplePlan(filter=_ARESAMPLE_HQ_NO_DITHER, dither=False)


def flac_tag(bit_depth: int, sample_rate: int) -> str:
    """Canonical exclusive/browser FLAC tag: ``flac_{depth}_{rate}``."""
    return f"flac_{bit_depth}_{sample_rate}"


def _flac_label(bit_depth: int, sample_rate: int) -> str:
    rate_k = sample_rate / 1000.0
    if rate_k == int(rate_k):
        rate_s = f"{int(rate_k)}kHz"
    else:
        rate_s = f"{rate_k:g}kHz"
    if bit_depth >= 24:
        return f"FLAC 24-bit {rate_s}"
    return f"FLAC {rate_s}"


def _make_flac_profile(
    bit_depth: int,
    sample_rate: int,
    *,
    browser_listed: bool,
) -> StreamProfile:
    return StreamProfile(
        tag=flac_tag(bit_depth, sample_rate),
        sample_rate=sample_rate,
        bitrate_kbps=0,
        extension="flac",
        media_type="audio/flac",
        kind="flac",
        label=_flac_label(bit_depth, sample_rate),
        bit_depth=bit_depth,
        can_play=_CAN_PLAY_FLAC,
        browser_listed=browser_listed,
        approx_mb_per_hour=_BROWSER_FLAC_APPROX.get((bit_depth, sample_rate)),
    )


# Browser marketing list for FLAC (historical three). All exclusive-matrix
# cells are still resolvable via get_profile; only these appear on /api/codecs.
_BROWSER_FLAC: frozenset[tuple[int, int]] = frozenset(
    {
        (16, 44100),
        (16, 48000),
        (24, 96000),
    }
)
# Decimal MB/hour midpoints for the three marketing FLACs (Settings only).
_BROWSER_FLAC_APPROX: dict[tuple[int, int], int] = {
    (16, 44100): 380,
    (16, 48000): 410,
    (24, 96000): 1230,
}


def _build_profiles() -> dict[str, StreamProfile]:
    profiles: list[StreamProfile] = [
        StreamProfile(
            tag="opus_192_48000",
            sample_rate=48000,
            bitrate_kbps=192,
            extension="opus",
            media_type="audio/ogg",
            kind="opus",
            label="Opus 192k 48kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_OPUS,
            browser_listed=True,
            approx_mb_per_hour=86,
        ),
        StreamProfile(
            tag="opus_160_48000",
            sample_rate=48000,
            bitrate_kbps=160,
            extension="opus",
            media_type="audio/ogg",
            kind="opus",
            label="Opus 160k 48kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_OPUS,
            browser_listed=True,
            approx_mb_per_hour=72,
        ),
        StreamProfile(
            tag="opus_128_48000",
            sample_rate=48000,
            bitrate_kbps=128,
            extension="opus",
            media_type="audio/ogg",
            kind="opus",
            label="Opus 128k 48kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_OPUS,
            browser_listed=True,
            approx_mb_per_hour=58,
        ),
        StreamProfile(
            tag="opus_96_48000",
            sample_rate=48000,
            bitrate_kbps=96,
            extension="opus",
            media_type="audio/ogg",
            kind="opus",
            label="Opus 96k 48kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_OPUS,
            browser_listed=True,
            approx_mb_per_hour=43,
        ),
        StreamProfile(
            tag="opus_64_48000",
            sample_rate=48000,
            bitrate_kbps=64,
            extension="opus",
            media_type="audio/ogg",
            kind="opus",
            label="Opus 64k 48kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_OPUS,
            browser_listed=True,
            approx_mb_per_hour=29,
        ),
    ]
    for rate in EXCLUSIVE_RATES_HZ:
        for depth in EXCLUSIVE_DEPTHS:
            profiles.append(
                _make_flac_profile(
                    depth,
                    rate,
                    browser_listed=(depth, rate) in _BROWSER_FLAC,
                )
            )
    return {p.tag: p for p in profiles}


PROFILES: dict[str, StreamProfile] = _build_profiles()


def browser_profiles() -> list[StreamProfile]:
    """Profiles listed on GET /api/codecs (browser streaming UI)."""
    return [p for p in PROFILES.values() if p.browser_listed]


def exclusive_flac_profiles() -> list[StreamProfile]:
    """Full exclusive FLAC allowlist (12 tags), ordered rate then depth."""
    out: list[StreamProfile] = []
    for rate in EXCLUSIVE_RATES_HZ:
        for depth in EXCLUSIVE_DEPTHS:
            out.append(PROFILES[flac_tag(depth, rate)])
    return out


def exclusive_formats_payload() -> dict:
    """JSON body for GET /api/exclusive-formats."""
    return {
        "formats": [
            {
                "tag": p.tag,
                "sample_rate": p.sample_rate,
                "bit_depth": p.bit_depth,
                "label": p.label,
            }
            for p in exclusive_flac_profiles()
        ]
    }


def browser_codecs_payload() -> dict:
    """JSON body for GET /api/codecs (browser-listed profiles only)."""
    return {
        "codecs": [
            {
                "id": p.tag,
                "label": p.label,
                "kind": p.kind,
                "media_type": p.media_type,
                "can_play": p.can_play,
                "bitrate_kbps": p.bitrate_kbps,
                "bit_depth": p.bit_depth,
                "sample_rate": p.sample_rate,
                "approx_mb_per_hour": p.approx_mb_per_hour,
            }
            for p in browser_profiles()
        ],
        "default": DEFAULT_PROFILE_TAG,
    }


def get_profile(tag: str) -> StreamProfile:
    profile = PROFILES.get(tag)
    if profile is None:
        raise ValueError(
            f"Unsupported codec profile {tag!r}; "
            f"allowed: {sorted(PROFILES)}"
        )
    return profile
