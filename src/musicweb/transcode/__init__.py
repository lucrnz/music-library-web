"""Transcode package: stream profiles, probe helpers, deps, and worker."""

from musicweb.transcode.deps import DependencyReport, check_dependencies
from musicweb.transcode.probe import (
    SourceAudioTech,
    probe_source_audio_tech,
    tech_from_track,
)
from musicweb.transcode.profiles import (
    DEFAULT_PROFILE_TAG,
    EXCLUSIVE_DEPTHS,
    EXCLUSIVE_RATES_HZ,
    PROFILES,
    StreamProfile,
    browser_profiles,
    exclusive_flac_profiles,
    exclusive_formats_payload,
    flac_tag,
    get_profile,
    plan_aresample,
)
from musicweb.transcode.worker import TranscodeCanceled, Transcoder

__all__ = [
    "DEFAULT_PROFILE_TAG",
    "EXCLUSIVE_DEPTHS",
    "EXCLUSIVE_RATES_HZ",
    "PROFILES",
    "StreamProfile",
    "browser_profiles",
    "exclusive_flac_profiles",
    "exclusive_formats_payload",
    "flac_tag",
    "get_profile",
    "plan_aresample",
    "SourceAudioTech",
    "probe_source_audio_tech",
    "tech_from_track",
    "DependencyReport",
    "check_dependencies",
    "Transcoder",
    "TranscodeCanceled",
]
