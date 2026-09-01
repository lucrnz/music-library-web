"""Packaged Various Artists portrait (Aero CD + note)."""

from __future__ import annotations

from pathlib import Path

_ASSETS = Path(__file__).resolve().parent / "assets"


def va_portrait_webp(size: str) -> bytes:
    name = "va-artist-full.webp" if size == "full" else "va-artist-thumb.webp"
    return (_ASSETS / name).read_bytes()
