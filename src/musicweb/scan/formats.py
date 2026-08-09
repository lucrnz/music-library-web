"""Packed lossless format detection for indexing and streaming eligibility.

Only **FLAC** and **ALAC** (in .m4a/.mp4/.alac) are indexed. Unpacked PCM
containers (.wav, .aiff, .aif) are not part of the library.
"""

from __future__ import annotations

from pathlib import Path

from mutagen.mp4 import MP4

# Extensions we consider for indexing (may still reject after codec probe).
CANDIDATE_EXTENSIONS = frozenset({
    ".flac",
    ".m4a",
    ".mp4",
    ".alac",
})

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


def _is_alac(path: Path) -> bool:
    """True when an MP4/M4A container holds ALAC (not AAC)."""
    try:
        audio = MP4(path)
    except Exception:
        return False
    if audio is None or audio.info is None:
        return False
    codec = (getattr(audio.info, "codec", None) or "").lower()
    # mutagen reports 'alac' for Apple Lossless
    if codec == "alac":
        return True
    # Some builds expose codec_description
    desc = (getattr(audio.info, "codec_description", None) or "").lower()
    if "alac" in desc or "lossless" in desc:
        return True
    return False
