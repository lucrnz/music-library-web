"""Stream product profiles (Opus + FLAC tags served to the client)."""

from __future__ import annotations

from dataclasses import dataclass

DEFAULT_PROFILE_TAG = "opus_192_48000"

# MIME strings for HTMLMediaElement.canPlayType() on the client.
_CAN_PLAY_OPUS = 'audio/ogg; codecs="opus"'
_CAN_PLAY_FLAC = "audio/flac"


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
