"""Cover art extraction via ffmpeg and folder fallbacks."""

from __future__ import annotations

import io
import logging
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

THUMB_SIZE = 200
THUMB_JPEG_QUALITY = 90

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


def get_cover_bytes(audio_path: Path) -> tuple[bytes, str]:
    """
    Return (image_bytes, media_type) for the given audio file.

    Order: embedded art → folder cover → SVG placeholder.
    Full-size path: raw extracted bytes only — no conversion or downscale.
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


def _placeholder_thumb_jpeg() -> bytes:
    """Solid dark 200×200 JPEG used when no cover art exists."""
    img = Image.new("RGB", (THUMB_SIZE, THUMB_SIZE), (42, 42, 46))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=THUMB_JPEG_QUALITY, optimize=True)
    return buf.getvalue()


def get_cover_thumbnail(audio_path: Path) -> tuple[bytes, str]:
    """
    Return a fixed 200×200 JPEG (quality 90) thumbnail for the given audio file.

    Uses the same art sources as get_cover_bytes, then converts with Pillow.
    """
    data, media_type = get_cover_bytes(audio_path)
    if media_type == "image/svg+xml":
        return _placeholder_thumb_jpeg(), "image/jpeg"

    try:
        with Image.open(io.BytesIO(data)) as img:
            # Center-crop to square and resize to exact 200×200
            fitted = ImageOps.fit(
                img,
                (THUMB_SIZE, THUMB_SIZE),
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5),
            )
            if fitted.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", fitted.size, (42, 42, 46))
                if fitted.mode == "P":
                    fitted = fitted.convert("RGBA")
                alpha = fitted.split()[-1] if fitted.mode in ("RGBA", "LA") else None
                if alpha is not None:
                    background.paste(fitted.convert("RGB"), mask=alpha)
                else:
                    background.paste(fitted.convert("RGB"))
                fitted = background
            elif fitted.mode != "RGB":
                fitted = fitted.convert("RGB")

            buf = io.BytesIO()
            fitted.save(
                buf,
                format="JPEG",
                quality=THUMB_JPEG_QUALITY,
                optimize=True,
            )
            return buf.getvalue(), "image/jpeg"
    except Exception as exc:
        logger.debug("cover thumbnail conversion failed: %s", exc)
        return _placeholder_thumb_jpeg(), "image/jpeg"
