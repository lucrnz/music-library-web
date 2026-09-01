"""Shared disk-backed WebP assets (album covers, artist portraits)."""

from musicweb.images.render import (
    FULL_SIZE,
    FULL_WEBP_QUALITY,
    THUMB_SIZE,
    THUMB_WEBP_QUALITY,
    WEBP_METHOD,
    full_thumb_webp_pair,
    placeholder_webp,
    render_square_webp,
)
from musicweb.images.va_portrait import va_portrait_webp
from musicweb.images.webp_store import WebpAssetStore

__all__ = [
    "FULL_SIZE",
    "FULL_WEBP_QUALITY",
    "THUMB_SIZE",
    "THUMB_WEBP_QUALITY",
    "WEBP_METHOD",
    "WebpAssetStore",
    "full_thumb_webp_pair",
    "placeholder_webp",
    "render_square_webp",
    "va_portrait_webp",
]
