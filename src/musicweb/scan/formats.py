"""Packed lossless and opt-in lossy format detection for index eligibility.

Lossless: **FLAC** and **ALAC** (in .m4a/.mp4/.alac). Lossy (only when
``index_lossy`` is on): **MP3** and **AAC** in .m4a/.mp4. Unpacked PCM
(.wav, .aiff, .aif) is not part of the library.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from mutagen.mp4 import MP4

# Extensions we consider for lossless indexing (may still reject after probe).
CANDIDATE_EXTENSIONS = frozenset({
    ".flac",
    ".m4a",
    ".mp4",
    ".alac",
})

LOSSY_EXTENSIONS = frozenset({".mp3", ".m4a", ".mp4"})

LOSSY_SOURCE_CODECS = frozenset({"mp3", "aac"})

# Always-lossless by extension (no further probe required for indexing).
ALWAYS_LOSSLESS = frozenset({".flac", ".alac"})

AudioKind = Literal["lossless", "lossy"]


def _probe_mp4_kind(path: Path) -> Literal["alac", "aac"] | None:
    """Open an MP4/M4A once. None if unreadable or missing info."""
    try:
        audio = MP4(path)
    except Exception:
        return None
    if audio is None or audio.info is None:
        return None
    return mp4_kind(audio.info)


def audio_kind(path: Path) -> AudioKind | None:
    """Classify a file for index eligibility. Opens an MP4 at most once."""
    if not path.is_file():
        return None
    ext = path.suffix.lower()
    if ext in ALWAYS_LOSSLESS:
        return "lossless"
    if ext == ".mp3":
        return "lossy"
    if ext in {".m4a", ".mp4"}:
        probed = _probe_mp4_kind(path)
        if probed == "alac":
            return "lossless"
        if probed == "aac":
            return "lossy"
        return None
    return None


def is_lossless_audio(path: Path) -> bool:
    """Return True if the file is packed lossless (FLAC or ALAC) we index."""
    return audio_kind(path) == "lossless"


def is_lossy_audio(path: Path) -> bool:
    """Return True if the file is MP3 or AAC-in-MP4 (not ALAC)."""
    return audio_kind(path) == "lossy"


def is_indexable_audio(path: Path, *, index_lossy: bool) -> bool:
    """Lossless always; MP3/AAC only when ``index_lossy`` is true."""
    kind = audio_kind(path)
    if kind == "lossless":
        return True
    return kind == "lossy" and bool(index_lossy)


def source_codec_is_lossy(source_codec: str | None) -> bool:
    return (source_codec or "").lower() in LOSSY_SOURCE_CODECS


def mp4_kind(info: object | None) -> Literal["alac", "aac"] | None:
    """ALAC vs AAC from mutagen MP4-family info. Callers pass MP4 info only."""
    if info is None:
        return None
    codec = (getattr(info, "codec", None) or "").lower()
    if codec == "alac":
        return "alac"
    desc = (getattr(info, "codec_description", None) or "").lower()
    if "alac" in desc or "lossless" in desc:
        return "alac"
    return "aac"
