"""Square WebP encoding and in-memory placeholders for library art."""

from __future__ import annotations

import io
import logging

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

THUMB_SIZE = 200
FULL_SIZE = 1000
THUMB_WEBP_QUALITY = 90
FULL_WEBP_QUALITY = 100
WEBP_METHOD = 6

# Solid gray used for alpha flatten and placeholders.
_BG_RGB = (42, 42, 46)


def flatten_rgb(img: Image.Image) -> Image.Image:
    if img.mode == "RGB":
        return img
    img = img.convert("RGBA")
    background = Image.new("RGB", img.size, _BG_RGB)
    background.paste(img, mask=img.split()[-1])
    return background


def placeholder_webp(size: str = "full") -> bytes:
    """In-memory solid placeholder WebP (never persisted per asset)."""
    px = FULL_SIZE if size == "full" else THUMB_SIZE
    kwargs: dict = {"method": WEBP_METHOD}
    if size == "full":
        kwargs.update(lossless=True, quality=FULL_WEBP_QUALITY)
    else:
        kwargs.update(quality=THUMB_WEBP_QUALITY)
    img = Image.new("RGB", (px, px), _BG_RGB)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", **kwargs)
    return buf.getvalue()


def render_square_webp(source: bytes, size: int, **save_kwargs) -> bytes | None:
    """Fit image bytes to a square WebP. Returns None on decode/encode failure."""
    if not source:
        return None
    try:
        with Image.open(io.BytesIO(source)) as img:
            fitted = ImageOps.fit(
                img,
                (size, size),
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5),
            )
            fitted = flatten_rgb(fitted)
            buf = io.BytesIO()
            fitted.save(buf, format="WEBP", **save_kwargs)
            return buf.getvalue()
    except Exception as exc:
        logger.debug("webp conversion failed: %s", exc)
        return None


def full_thumb_webp_pair(source: bytes) -> tuple[bytes, bytes] | None:
    """Encode full (lossless) + thumb WebP pair, or None if either fails."""
    full = render_square_webp(
        source,
        FULL_SIZE,
        lossless=True,
        quality=FULL_WEBP_QUALITY,
        method=WEBP_METHOD,
    )
    thumb = render_square_webp(
        source,
        THUMB_SIZE,
        quality=THUMB_WEBP_QUALITY,
        method=WEBP_METHOD,
    )
    if full is None or thumb is None:
        return None
    return full, thumb
