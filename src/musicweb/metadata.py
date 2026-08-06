"""Audio tag reading via mutagen."""

from __future__ import annotations

from pathlib import Path

from mutagen import File as MutagenFile
from mutagen.mp4 import MP4


def _first(tags: dict | None, *keys: str) -> str | None:
    if not tags:
        return None
    for key in keys:
        value = tags.get(key)
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
    # Handle "3/12" style
    part = str(raw).split("/")[0].strip()
    try:
        return int(part)
    except ValueError:
        return None


def read_metadata(path: Path) -> dict:
    """
    Return common tags for a single audio file.

    Falls back to the filename stem when tags are missing.
    """
    stem = path.stem
    result = {
        "path": path.name,
        "title": stem,
        "artist": "",
        "album": "",
        "track": None,
        "duration": None,
    }

    try:
        audio = MutagenFile(path, easy=True)
    except Exception:
        return result

    if audio is None:
        # Try non-easy for MP4/ALAC edge cases
        try:
            audio = MutagenFile(path)
        except Exception:
            return result
        if audio is None:
            return result

    info = getattr(audio, "info", None)
    if info is not None and getattr(info, "length", None):
        result["duration"] = float(info.length)

    tags = getattr(audio, "tags", None)
    if tags is None:
        return result

    # EasyID3 / EasyMP4 style
    if hasattr(tags, "get"):
        title = _first(tags, "title", "\xa9nam")
        artist = _first(tags, "artist", "\xa9ART")
        album = _first(tags, "album", "\xa9alb")
        track_raw = _first(tags, "tracknumber", "trkn")

        if title:
            result["title"] = title
        if artist:
            result["artist"] = artist
        if album:
            result["album"] = album
        result["track"] = _track_number(track_raw)

        # MP4 non-easy: trkn is a list of tuples
        if result["track"] is None and isinstance(audio, MP4) and audio.tags:
            trkn = audio.tags.get("trkn")
            if trkn and isinstance(trkn, list) and trkn[0]:
                try:
                    result["track"] = int(trkn[0][0])
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

    return result
