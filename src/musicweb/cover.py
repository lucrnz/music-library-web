"""Cover art extraction and persisted WebP store under the data directory.

Covers live at ``$MUSICWEB_DATA_DIR/covers/albums/{album_id}.{full|thumb}.webp``
and survive process restarts. Placeholders are never written to disk and never
set ``has_cover``.
"""

from __future__ import annotations

import io
import logging
import subprocess
import tempfile
import threading
from pathlib import Path

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

THUMB_SIZE = 200
FULL_SIZE = 1000
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
    for pattern in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
        matches = sorted(directory.glob(pattern))
        if matches:
            return matches[0]
    return None


def _extract_embedded(audio_path: Path, dest: Path) -> bool:
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
    with tempfile.TemporaryDirectory(prefix="musicweb-cover-") as tmp:
        for ext, media_type in ((".jpg", "image/jpeg"), (".png", "image/png")):
            dest = Path(tmp) / f"cover{ext}"
            if _extract_embedded(audio_path, dest):
                return dest.read_bytes(), media_type

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
    return None


def _flatten_rgb(img: Image.Image) -> Image.Image:
    if img.mode == "RGB":
        return img
    img = img.convert("RGBA")
    background = Image.new("RGB", img.size, (42, 42, 46))
    background.paste(img, mask=img.split()[-1])
    return background


def placeholder_webp(size: str = "full") -> bytes:
    """In-memory solid placeholder WebP (never persisted per album)."""
    px = FULL_SIZE if size == "full" else THUMB_SIZE
    kwargs: dict = {"method": WEBP_METHOD}
    if size == "full":
        kwargs.update(lossless=True, quality=FULL_WEBP_QUALITY)
    else:
        kwargs.update(quality=THUMB_WEBP_QUALITY)
    img = Image.new("RGB", (px, px), (42, 42, 46))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", **kwargs)
    return buf.getvalue()


def _render_real_webp(source: tuple[bytes, str], size: int, **save_kwargs) -> bytes | None:
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
        return None


class CoverStore:
    """Persisted album-keyed WebP covers under the data directory."""

    def __init__(self, data_dir: Path) -> None:
        self.root = data_dir / "covers" / "albums"
        self.root.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _lock_for(self, album_id: str) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(album_id)
            if lock is None:
                lock = threading.Lock()
                self._locks[album_id] = lock
            return lock

    def path_for(self, album_id: str, size: str) -> Path:
        if size not in ("full", "thumb"):
            raise ValueError(f"Invalid cover size: {size}")
        return self.root / f"{album_id}.{size}.webp"

    def has_cover(self, album_id: str) -> bool:
        full = self.path_for(album_id, "full")
        thumb = self.path_for(album_id, "thumb")
        try:
            return (
                full.is_file()
                and full.stat().st_size > 0
                and thumb.is_file()
                and thumb.stat().st_size > 0
            )
        except OSError:
            return False

    def cover_path(self, album_id: str, size: str) -> Path | None:
        path = self.path_for(album_id, size)
        try:
            if path.is_file() and path.stat().st_size > 0:
                return path
        except OSError:
            pass
        return None

    def _atomic_write(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(path.suffix + ".partial")
        partial.write_bytes(data)
        partial.replace(path)

    def delete_album_cover(self, album_id: str) -> None:
        for size in ("full", "thumb"):
            path = self.path_for(album_id, size)
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass

    def ensure_album_cover(
        self, album_id: str, audio_path: Path, *, force: bool = False
    ) -> bool:
        """
        Extract real cover art for ``album_id`` from ``audio_path``.

        Writes full+thumb WebP only when real art is found.
        Returns True if files on disk represent real art.
        Returns False when no art source exists (nothing written, or removed on force).
        """
        if not force and self.has_cover(album_id):
            return True

        lock = self._lock_for(album_id)
        with lock:
            if not force and self.has_cover(album_id):
                return True

            source = _cover_source(audio_path)
            if source is None:
                if force:
                    self.delete_album_cover(album_id)
                return False

            full = _render_real_webp(
                source,
                FULL_SIZE,
                lossless=True,
                quality=FULL_WEBP_QUALITY,
                method=WEBP_METHOD,
            )
            thumb = _render_real_webp(
                source,
                THUMB_SIZE,
                quality=THUMB_WEBP_QUALITY,
                method=WEBP_METHOD,
            )
            if full is None or thumb is None:
                if force:
                    self.delete_album_cover(album_id)
                return False

            try:
                self._atomic_write(self.path_for(album_id, "full"), full)
                self._atomic_write(self.path_for(album_id, "thumb"), thumb)
            except OSError as exc:
                logger.debug("cover store write failed: %s", exc)
                return False
            return True

    def get_or_fill(
        self, album_id: str, audio_path: Path
    ) -> dict[str, Path | bytes]:
        """Return full/thumb as Path when on disk, else try extract; else in-memory placeholder."""
        if self.has_cover(album_id):
            return {
                "full": self.path_for(album_id, "full"),
                "thumb": self.path_for(album_id, "thumb"),
            }
        self.ensure_album_cover(album_id, audio_path, force=False)
        out: dict[str, Path | bytes] = {}
        for size in ("full", "thumb"):
            path = self.cover_path(album_id, size)
            out[size] = path if path is not None else placeholder_webp(size)
        return out
