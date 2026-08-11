"""Stream product profiles + pure encode policy (argv fragments, aresample).

High-quality rate/bit-depth conversion uses libsoxr through aresample at
SoX "very high quality" equivalents (``rate -v -L``):
  - precision=28 ≈ SoX ``rate -v``
  - linear phase ≈ SoX ``-L`` (libsoxr default; not exposed in ffmpeg)
  - cutoff=0.95 (SoX VHQ ~95% bandwidth; ffmpeg soxr default is ~0.91)
  - dither_method=shibata ≈ SoX ``dither -s`` **only when reducing bit depth**
    (source bits > profile bits). Never dither when increasing bit depth
    (e.g. 16→24). Perfect rate+depth match skips aresample entirely.
"""

from __future__ import annotations

from dataclasses import dataclass

from musicweb.transcode.probe import SourceAudioTech

DEFAULT_PROFILE_TAG = "opus_192_48000"

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
            args = ["-c:a", "flac"]
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


PROFILES: dict[str, StreamProfile] = {
    p.tag: p
    for p in [
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
        ),
        StreamProfile(
            tag="flac_16_44100",
            sample_rate=44100,
            bitrate_kbps=0,
            extension="flac",
            media_type="audio/flac",
            kind="flac",
            label="FLAC 44.1kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_FLAC,
        ),
        StreamProfile(
            tag="flac_16_48000",
            sample_rate=48000,
            bitrate_kbps=0,
            extension="flac",
            media_type="audio/flac",
            kind="flac",
            label="FLAC 48kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_FLAC,
        ),
        StreamProfile(
            tag="flac_24_96000",
            sample_rate=96000,
            bitrate_kbps=0,
            extension="flac",
            media_type="audio/flac",
            kind="flac",
            label="FLAC 24-bit 96kHz",
            bit_depth=24,
            can_play=_CAN_PLAY_FLAC,
        ),
    ]
}


def get_profile(tag: str) -> StreamProfile:
    profile = PROFILES.get(tag)
    if profile is None:
        raise ValueError(
            f"Unsupported codec profile {tag!r}; "
            f"allowed: {sorted(PROFILES)}"
        )
    return profile
