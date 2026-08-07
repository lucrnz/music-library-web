"""Cover art extraction via ffmpeg and folder fallbacks, WebP encoding via Pillow.

Rendered covers are stored under the process cache ``covers/`` subdirectory
in an album-keyed CoverCache (a TempKVCache): tracks sharing an album tag
title share one cached full + thumbnail WebP, rendered from a single ffmpeg
extraction.
"""

from __future__ import annotations

import io
import logging
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

from musicweb.cache import TempKVCache

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


def _cover_source(audio_path: Path) -> tuple[bytes, str] | None:
    """
    Return raw (image_bytes, media_type) for the given audio file.

    Order: embedded art → folder cover → None (no art).
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

    # 3) No art
    return None


def _flatten_rgb(img: Image.Image) -> Image.Image:
    """Composite alpha modes onto a dark background; ensure RGB output."""
    if img.mode == "RGB":
        return img
    img = img.convert("RGBA")
    background = Image.new("RGB", img.size, (42, 42, 46))
    background.paste(img, mask=img.split()[-1])
    return background


def _placeholder_webp(size: int, **save_kwargs) -> bytes:
    """Solid dark square WebP used when no cover art exists."""
    img = Image.new("RGB", (size, size), (42, 42, 46))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", **save_kwargs)
    return buf.getvalue()


def _render_webp(
    source: tuple[bytes, str] | None, size: int, **save_kwargs
) -> bytes:
    """Render a fixed square WebP (center-crop + LANCZOS) from a cover source."""
    if source is None:
        return _placeholder_webp(size, **save_kwargs)

    data, _media_type = source
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
            return buf.getvalue()
    except Exception as exc:
        logger.debug("cover webp conversion failed: %s", exc)
        return _placeholder_webp(size, **save_kwargs)


class CoverCache(TempKVCache):
    """Album-keyed cache of ready-to-serve WebP cover art.

    Keys derive from the album tag title (same album ⇒ same art); files
    without an album tag fall back to a per-file key. On a first miss both
    sizes are rendered from a single ffmpeg extraction and stored as
    ``<key>.full.webp`` / ``<key>.thumb.webp``.
    """

    def __init__(self) -> None:
        super().__init__("covers")

    @staticmethod
    def key_for(album: str | None, relative_path: str) -> str:
        """Base cache key: normalized album title when tagged, else the path."""
        if album:
            normalized = " ".join(album.split()).lower()
            if normalized:
                return TempKVCache.digest("album", normalized)
        return TempKVCache.digest("file", relative_path)

    def _entry_key(self, base_key: str, size: str) -> str:
        return f"{base_key}.{size}.webp"

    def cover_path(self, base_key: str, size: str) -> Path | None:
        """Return the on-disk path for a ready WebP, or None on a miss."""
        path = self._path(self._entry_key(base_key, size))
        try:
            if path.is_file() and path.stat().st_size > 0:
                return path
        except OSError:
            pass
        return None

    def get_cover(self, base_key: str, size: str) -> bytes | None:
        """Return cached WebP bytes for key+size ("full"/"thumb"), or None."""
        return self.get(self._entry_key(base_key, size))

    def get_or_fill(self, base_key: str, audio_path: Path) -> dict[str, bytes]:
        """
        Return {"full": ..., "thumb": ...} WebP bytes for the key.

        On a cache miss the cover source is extracted once and both sizes are
        rendered and stored. Per-key locks serialize concurrent misses for the
        same album; other albums fill in parallel. Waiters re-check and serve
        the winner's output.
        """
        full = self.get_cover(base_key, "full")
        thumb = self.get_cover(base_key, "thumb")
        if full is not None and thumb is not None:
            return {"full": full, "thumb": thumb}

        # One lock per album base key so full+thumb fill atomically together
        # (parent get_or_set is per entry key and would extract twice).
        lock = self._lock_for(base_key)
        with lock:
            try:
                full = self.get_cover(base_key, "full")
                thumb = self.get_cover(base_key, "thumb")
                if full is not None and thumb is not None:
                    return {"full": full, "thumb": thumb}

                source = _cover_source(audio_path)
                full = _render_webp(
                    source,
                    FULL_SIZE,
                    lossless=True,
                    quality=FULL_WEBP_QUALITY,
                    method=WEBP_METHOD,
                )
                thumb = _render_webp(
                    source,
                    THUMB_SIZE,
                    quality=THUMB_WEBP_QUALITY,
                    method=WEBP_METHOD,
                )
                try:
                    self.set(self._entry_key(base_key, "full"), full)
                    self.set(self._entry_key(base_key, "thumb"), thumb)
                except OSError as exc:
                    logger.debug("cover cache write failed: %s", exc)
                return {"full": full, "thumb": thumb}
            finally:
                self._release_lock(base_key, lock)
