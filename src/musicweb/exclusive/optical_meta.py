"""Session-only Yellow Book tags, covers, and disc-local lyrics."""

from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path

from musicweb.exclusive.optical_fs import CdromFile
from musicweb.lyrics.local import read_local_lyrics
from musicweb.lyrics.types import LocalLyrics
from musicweb.metadata import read_metadata

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FileMeta:
    title: str | None
    artist: str | None
    album: str | None
    albumartist: str | None
    track: int | None
    disc: int | None
    year: int | None
    duration: float | None
    sample_rate_hz: int | None
    bit_depth: int | None
    channels: int | None
    source_codec: str | None
    has_cover: bool
    has_local_lyrics: bool


def _empty_meta() -> FileMeta:
    return FileMeta(
        title=None,
        artist=None,
        album=None,
        albumartist=None,
        track=None,
        disc=None,
        year=None,
        duration=None,
        sample_rate_hz=None,
        bit_depth=None,
        channels=None,
        source_codec=None,
        has_cover=False,
        has_local_lyrics=False,
    )


def enrich_file(path: Path) -> FileMeta:
    """Mutagen tags + cover/lyrics flags. Swallows per-file errors."""
    try:
        meta = read_metadata(path)
    except Exception:
        logger.debug("cdrom tag read failed %s", path, exc_info=True)
        meta = None
    try:
        has_cover = cover_bytes(path) is not None
    except Exception:
        logger.debug("cdrom cover probe failed %s", path, exc_info=True)
        has_cover = False
    try:
        has_lyrics = local_lyrics(path) is not None
    except Exception:
        logger.debug("cdrom lyrics probe failed %s", path, exc_info=True)
        has_lyrics = False
    if meta is None:
        empty = _empty_meta()
        return FileMeta(
            **{**empty.__dict__, "has_cover": has_cover, "has_local_lyrics": has_lyrics}
        )
    return FileMeta(
        title=meta.title,
        artist=meta.artist,
        album=meta.album,
        albumartist=meta.albumartist,
        track=meta.track,
        disc=meta.disc,
        year=meta.year,
        duration=meta.duration,
        sample_rate_hz=meta.sample_rate_hz,
        bit_depth=meta.bit_depth,
        channels=meta.channels,
        source_codec=meta.source_codec,
        has_cover=has_cover,
        has_local_lyrics=has_lyrics,
    )


def cover_bytes(path: Path) -> bytes | None:
    """Embedded (ffmpeg extract) then ``FOLDER_COVER_NAMES``. Process-temp only."""
    # Late import: musicweb.cover pulls the job runner.
    from musicweb.cover import FOLDER_COVER_NAMES, _extract_embedded

    try:
        with tempfile.TemporaryDirectory(prefix="musicweb-cdrom-cover-") as tmp:
            for ext in (".jpg", ".png"):
                dest = Path(tmp) / f"cover{ext}"
                if _extract_embedded(path, dest):
                    return dest.read_bytes()
        for name in FOLDER_COVER_NAMES:
            candidate = path.parent / name
            if candidate.is_file():
                return candidate.read_bytes()
    except Exception:
        logger.debug("cdrom cover_bytes failed %s", path, exc_info=True)
        return None
    return None


def local_lyrics(path: Path) -> LocalLyrics | None:
    try:
        return read_local_lyrics(path)
    except Exception:
        logger.debug("cdrom local lyrics failed %s", path, exc_info=True)
        return None


def apply_file_meta(item: CdromFile, meta: FileMeta) -> None:
    """Patch tags in place. Walk-time ``source_codec`` (LossyMark kind) stays."""
    item.title = meta.title
    item.artist = meta.artist
    item.album = meta.album
    item.albumartist = meta.albumartist
    item.track = meta.track
    item.disc = meta.disc
    item.year = meta.year
    item.duration = meta.duration
    item.sample_rate_hz = meta.sample_rate_hz
    item.bit_depth = meta.bit_depth
    item.channels = meta.channels
    item.has_cover = meta.has_cover
    item.has_local_lyrics = meta.has_local_lyrics
