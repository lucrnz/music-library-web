"""Audio tag reading via mutagen."""

from __future__ import annotations

import re
from pathlib import Path

from mutagen import File as MutagenFile
from mutagen.mp4 import MP4

_YEAR_RE = re.compile(r"(\d{4})")


def _first(tags: dict | None, *keys: str) -> str | None:
    if not tags:
        return None
    for key in keys:
        try:
            value = tags.get(key)
        except ValueError:
            # Vorbis tags reject MP4-style fallback keys with ValueError.
            continue
        if value is None:
            continue
        if isinstance(value, list):
            if not value:
                continue
            value = value[0]
        text = str(value).strip()
        if text:
            return text
    return None


def _track_number(raw: str | None) -> int | None:
    if not raw:
        return None
    part = str(raw).split("/")[0].strip()
    try:
        return int(part)
    except ValueError:
        return None


def _parse_year(raw: str | None) -> int | None:
    if not raw:
        return None
    match = _YEAR_RE.search(str(raw))
    if not match:
        return None
    try:
        year = int(match.group(1))
    except ValueError:
        return None
    if 1000 <= year <= 2100:
        return year
    return None


def _audio_tech_from_info(info: object, path: Path) -> dict:
    """Extract sample_rate_hz, bit_depth, channels, source_codec from mutagen info."""
    sample_rate_hz = getattr(info, "sample_rate", None)
    if sample_rate_hz is not None:
        try:
            sample_rate_hz = int(sample_rate_hz)
        except (TypeError, ValueError):
            sample_rate_hz = None

    bit_depth = getattr(info, "bits_per_sample", None)
    if bit_depth is None:
        bit_depth = getattr(info, "sample_size", None)
    if bit_depth is not None:
        try:
            bit_depth = int(bit_depth)
            if bit_depth <= 0:
                bit_depth = None
        except (TypeError, ValueError):
            bit_depth = None

    channels = getattr(info, "channels", None)
    if channels is not None:
        try:
            channels = int(channels)
        except (TypeError, ValueError):
            channels = None

    source_codec: str | None = None
    ext = path.suffix.lower()
    if ext == ".flac":
        source_codec = "flac"
    elif ext in {".m4a", ".mp4", ".alac"}:
        codec = (getattr(info, "codec", None) or "").lower()
        source_codec = codec or "alac"
    else:
        codec = getattr(info, "codec", None)
        if codec:
            source_codec = str(codec).lower()

    return {
        "sample_rate_hz": sample_rate_hz,
        "bit_depth": bit_depth,
        "channels": channels,
        "source_codec": source_codec,
    }


def read_metadata(path: Path) -> dict:
    """
    Return common tags + source audio tech for a single audio file.

    Falls back to the filename stem when title is missing.
    Tech keys: sample_rate_hz, bit_depth, channels, source_codec (may be None).
    """
    stem = path.stem
    result: dict = {
        "title": stem,
        "artist": "",
        "album": "",
        "albumartist": "",
        "track": None,
        "disc": None,
        "year": None,
        "duration": None,
        "sample_rate_hz": None,
        "bit_depth": None,
        "channels": None,
        "source_codec": None,
    }

    try:
        audio = MutagenFile(path, easy=True)
    except Exception:
        return result

    if audio is None:
        try:
            audio = MutagenFile(path)
        except Exception:
            return result
        if audio is None:
            return result

    info = getattr(audio, "info", None)
    if info is not None:
        if getattr(info, "length", None):
            result["duration"] = float(info.length)
        result.update(_audio_tech_from_info(info, path))

    tags = getattr(audio, "tags", None)
    if tags is None:
        return result

    if hasattr(tags, "get"):
        title = _first(tags, "title", "\xa9nam")
        artist = _first(tags, "artist", "\xa9ART")
        album = _first(tags, "album", "\xa9alb")
        albumartist = _first(
            tags,
            "albumartist",
            "album artist",
            "aART",
        )
        track_raw = _first(tags, "tracknumber", "trkn")
        disc_raw = _first(tags, "discnumber", "disknumber", "disk")
        year_raw = _first(tags, "date", "year", "\xa9day")

        if title:
            result["title"] = title
        if artist:
            result["artist"] = artist
        if album:
            result["album"] = album
        if albumartist:
            result["albumartist"] = albumartist
        result["track"] = _track_number(track_raw)
        result["disc"] = _track_number(disc_raw)
        result["year"] = _parse_year(year_raw)

        # MP4 non-easy fallbacks
        if isinstance(audio, MP4) and audio.tags:
            if result["track"] is None:
                trkn = audio.tags.get("trkn")
                if trkn and isinstance(trkn, list) and trkn[0]:
                    try:
                        result["track"] = int(trkn[0][0])
                    except (TypeError, ValueError, IndexError):
                        pass
            if result["disc"] is None:
                disk = audio.tags.get("disk")
                if disk and isinstance(disk, list) and disk[0]:
                    try:
                        result["disc"] = int(disk[0][0])
                    except (TypeError, ValueError, IndexError):
                        pass
            if not result["title"] or result["title"] == stem:
                nam = audio.tags.get("\xa9nam")
                if nam:
                    result["title"] = str(nam[0])
            if not result["artist"]:
                art = audio.tags.get("\xa9ART")
                if art:
                    result["artist"] = str(art[0])
            if not result["album"]:
                alb = audio.tags.get("\xa9alb")
                if alb:
                    result["album"] = str(alb[0])
            if not result["albumartist"]:
                aart = audio.tags.get("aART")
                if aart:
                    result["albumartist"] = str(aart[0])
            if result["year"] is None:
                day = audio.tags.get("\xa9day")
                if day:
                    result["year"] = _parse_year(str(day[0]))

    return result
