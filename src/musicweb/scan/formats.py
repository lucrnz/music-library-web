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


def is_lossless_audio(path: Path) -> bool:
    """Return True if the file is packed lossless (FLAC or ALAC) we index."""
    if not path.is_file():
        return False
    ext = path.suffix.lower()
    if ext not in CANDIDATE_EXTENSIONS:
        return False
    if ext in ALWAYS_LOSSLESS or ext == ".flac":
        return True
    if ext in {".m4a", ".mp4"}:
        return _is_alac(path)
    return False


def is_lossy_audio(path: Path) -> bool:
    """Return True if the file is MP3 or AAC-in-MP4 (not ALAC)."""
    if not path.is_file():
        return False
    ext = path.suffix.lower()
    if ext not in LOSSY_EXTENSIONS:
        return False
    if ext == ".mp3":
        return True
    if ext in {".m4a", ".mp4"}:
        return not _is_alac(path)
    return False


def is_indexable_audio(path: Path, *, index_lossy: bool) -> bool:
    """Lossless always; MP3/AAC only when ``index_lossy`` is true."""
    if is_lossless_audio(path):
        return True
    return bool(index_lossy) and is_lossy_audio(path)


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


def _is_alac(path: Path) -> bool:
    """True when an MP4/M4A container holds ALAC (not AAC)."""
    try:
        audio = MP4(path)
    except Exception:
        return False
    if audio is None or audio.info is None:
        return False
    return mp4_kind(audio.info) == "alac"
