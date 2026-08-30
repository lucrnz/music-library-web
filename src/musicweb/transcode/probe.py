"""Source audio tech probing (mutagen + optional ffprobe fallback)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from musicweb.runtime.spawn import run as spawn_run

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SourceAudioTech:
    """Source file audio parameters (from DB scan or encode-time probe)."""

    sample_rate_hz: int | None
    bit_depth: int | None
    channels: int | None = None
    source_codec: str | None = None


def probe_source_audio_tech(
    path: Path,
    *,
    known: SourceAudioTech | None = None,
) -> SourceAudioTech:
    """Fill missing rate/bits via mutagen (and optional ffprobe fallback)."""
    rate = known.sample_rate_hz if known else None
    bits = known.bit_depth if known else None
    channels = known.channels if known else None
    codec = known.source_codec if known else None

    if rate is not None and bits is not None:
        return SourceAudioTech(rate, bits, channels, codec)

    try:
        from musicweb.metadata import read_metadata

        meta = read_metadata(path)
        if rate is None:
            rate = meta.sample_rate_hz
        if bits is None:
            bits = meta.bit_depth
        if channels is None:
            channels = meta.channels
        if codec is None:
            codec = meta.source_codec
    except Exception as exc:
        logger.debug("mutagen tech probe failed for %s: %s", path, exc)

    if rate is None or bits is None:
        try:
            proc = spawn_run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "a:0",
                    "-show_entries",
                    "stream=sample_rate,bits_per_raw_sample,bits_per_sample,channels,codec_name",
                    "-of",
                    "default=noprint_wrappers=1",
                    str(path),
                ],
                capture_output=True,
                timeout=15,
                check=False,
            )
            text = (proc.stdout or b"").decode("utf-8", errors="replace")
            vals: dict[str, str] = {}
            for line in text.splitlines():
                if "=" in line:
                    k, v = line.split("=", 1)
                    vals[k.strip()] = v.strip()
            if rate is None and vals.get("sample_rate"):
                rate = int(vals["sample_rate"])
            if bits is None:
                raw = vals.get("bits_per_raw_sample") or vals.get("bits_per_sample")
                if raw and raw not in ("N/A", "0"):
                    bits = int(raw)
            if channels is None and vals.get("channels"):
                channels = int(vals["channels"])
            if codec is None and vals.get("codec_name"):
                codec = vals["codec_name"]
        except Exception as exc:
            logger.debug("ffprobe tech probe failed for %s: %s", path, exc)

    return SourceAudioTech(rate, bits, channels, codec)


def tech_from_track(track: object) -> SourceAudioTech:
    """Build SourceAudioTech from a Track ORM row (duck-typed attributes)."""
    return SourceAudioTech(
        sample_rate_hz=getattr(track, "sample_rate_hz", None),
        bit_depth=getattr(track, "bit_depth", None),
        channels=getattr(track, "channels", None),
        source_codec=getattr(track, "source_codec", None),
    )
