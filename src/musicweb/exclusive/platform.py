"""Which platforms run the exclusive hog engine (mpv)."""

from __future__ import annotations

import sys

_HOG_PLATFORMS = frozenset({"darwin", "win32"})


def hog_supported(*, system: str | None = None) -> bool:
    """True on macOS and Windows. Linux and others stay a Downloads-only stub."""
    plat = system if system is not None else sys.platform
    return plat in _HOG_PLATFORMS
