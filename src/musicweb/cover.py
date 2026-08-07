"""Cover art extraction via ffmpeg and folder fallbacks, WebP encoding via Pillow."""

from __future__ import annotations

import io
import logging
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

THUMB_SIZE = 200
FULL_SIZE = 800
THUMB_WEBP_QUALITY = 90
FULL_WEBP_QUALITY = 100
WEBP_METHOD = 6

FOLDER_COVER_NAMES = (
    "cover.jpg",
    "cover.jpeg",
    "cover.png",
    "folder.jpg",
    "folder.jpeg",
    "folder.png",
    "Front.jpg",
    "Front.jpeg",
    "Front.png",
    "front.jpg",
    "front.jpeg",
    "front.png",
)

PLACEHOLDER_SVG = b"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#2a2a2e"/>
  <circle cx="128" cy="118" r="48" fill="none" stroke="#666" stroke-width="6"/>
  <circle cx="128" cy="118" r="12" fill="#666"/>
  <rect x="168" y="70" width="10" height="96" rx="3" fill="#666"/>
  <text x="128" y="220" text-anchor="middle" fill="#888" font-family="sans-serif" font-size="14">No cover</text>
</svg>
"""


def _folder_cover(directory: Path) -> Path | None:
    for name in FOLDER_COVER_NAMES:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    # Any image file as last resort
    for pattern in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
        matches = sorted(directory.glob(pattern))
        if matches:
            return matches[0]
    return None


def _extract_embedded(audio_path: Path, dest: Path) -> bool:
    """Extract first embedded picture stream with ffmpeg. Returns True on success."""
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(audio_path),
        "-an",
        "-vcodec",
        "copy",
        str(dest),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.debug("ffmpeg cover extract failed: %s", exc)
        return False
    return proc.returncode == 0 and dest.is_file() and dest.stat().st_size > 0


def _cover_source(audio_path: Path) -> tuple[bytes, str]:
    """
    Return raw (image_bytes, media_type) for the given audio file.

    Order: embedded art → folder cover → SVG placeholder (sentinel for "no art").
    """
    # 1) Embedded via ffmpeg (write to a temp file then read)
    with tempfile.TemporaryDirectory(prefix="musicweb-cover-") as tmp:
        # Try common image containers; ffmpeg picks based on stream
        for ext, media_type in ((".jpg", "image/jpeg"), (".png", "image/png")):
            dest = Path(tmp) / f"cover{ext}"
            if _extract_embedded(audio_path, dest):
                return dest.read_bytes(), media_type

    # 2) Folder sidecar
    folder = _folder_cover(audio_path.parent)
    if folder is not None:
        suffix = folder.suffix.lower()
        media_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
        }.get(suffix, "application/octet-stream")
        try:
            return folder.read_bytes(), media_type
        except OSError:
            pass

    # 3) Placeholder
    return PLACEHOLDER_SVG, "image/svg+xml"


def _flatten_rgb(img: Image.Image) -> Image.Image:
    """Composite alpha modes onto a dark background; ensure RGB output."""
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (42, 42, 46))
        if img.mode == "P":
            img = img.convert("RGBA")
        alpha = img.split()[-1] if img.mode in ("RGBA", "LA") else None
        if alpha is not None:
            background.paste(img.convert("RGB"), mask=alpha)
        else:
            background.paste(img.convert("RGB"))
        return background
    if img.mode != "RGB":
        return img.convert("RGB")
    return img


def _placeholder_webp(size: int, **save_kwargs) -> bytes:
    """Solid dark square WebP used when no cover art exists."""
    img = Image.new("RGB", (size, size), (42, 42, 46))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", **save_kwargs)
    return buf.getvalue()


def _cover_webp(audio_path: Path, size: int, **save_kwargs) -> tuple[bytes, str]:
    """
    Return a fixed square WebP (center-crop + LANCZOS resize) for the audio file.

    Uses the same art sources as _cover_source, then converts with Pillow.
    """
    data, media_type = _cover_source(audio_path)
    if media_type == "image/svg+xml":
        return _placeholder_webp(size, **save_kwargs), "image/webp"

    try:
        with Image.open(io.BytesIO(data)) as img:
            fitted = ImageOps.fit(
                img,
                (size, size),
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5),
            )
            fitted = _flatten_rgb(fitted)
            buf = io.BytesIO()
            fitted.save(buf, format="WEBP", **save_kwargs)
            return buf.getvalue(), "image/webp"
    except Exception as exc:
        logger.debug("cover webp conversion failed: %s", exc)
        return _placeholder_webp(size, **save_kwargs), "image/webp"


def get_cover_thumbnail(audio_path: Path) -> tuple[bytes, str]:
    """200×200 WebP thumbnail (quality 90, method 6)."""
    return _cover_webp(
        audio_path,
        THUMB_SIZE,
        quality=THUMB_WEBP_QUALITY,
        method=WEBP_METHOD,
    )


def get_cover_full(audio_path: Path) -> tuple[bytes, str]:
    """800×800 WebP full art (LANCZOS resize; lossless, quality 100, method 6)."""
    return _cover_webp(
        audio_path,
        FULL_SIZE,
        lossless=True,
        quality=FULL_WEBP_QUALITY,
        method=WEBP_METHOD,
    )
