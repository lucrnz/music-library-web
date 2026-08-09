"""Lossless format detection for indexing and streaming eligibility."""

from __future__ import annotations

from pathlib import Path

from mutagen import File as MutagenFile
from mutagen.flac import FLAC
from mutagen.mp4 import MP4

# Extensions we consider for indexing (may still reject after codec probe).
CANDIDATE_EXTENSIONS = frozenset({
    ".flac",
    ".m4a",
    ".mp4",
    ".alac",
    ".wav",
    ".aiff",
    ".aif",
})

# Always-lossless by extension (no further probe required for indexing).
ALWAYS_LOSSLESS = frozenset({".flac", ".wav", ".aiff", ".aif", ".alac"})


def is_candidate_audio(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in CANDIDATE_EXTENSIONS


def is_lossless_audio(path: Path) -> bool:
    """Return True if the file is a lossless audio format we index."""
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


def probe_codec_label(path: Path) -> str | None:
    """Best-effort short codec label for debugging (not stored in v1 core)."""
    ext = path.suffix.lower()
    try:
        if ext == ".flac":
            FLAC(path)
            return "flac"
        if ext in {".m4a", ".mp4", ".alac"}:
            audio = MP4(path)
            return getattr(audio.info, "codec", None) if audio and audio.info else None
        audio = MutagenFile(path)
        if audio and audio.info:
            return type(audio.info).__name__
    except Exception:
        return None
    return None
