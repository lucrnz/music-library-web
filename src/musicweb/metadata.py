"""Audio tag reading via mutagen."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from mutagen import File as MutagenFile
from mutagen.mp4 import MP4

from musicweb.scan.bitrate_mode import lossy_bitrate_mode
from musicweb.scan.formats import mp4_kind

_YEAR_RE = re.compile(r"(\d{4})")


@dataclass(frozen=True)
class TrackMetadata:
    """Tags + source audio tech for one file."""

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
    bitrate_kbps: int | None = None
    bitrate_mode: str | None = None


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
    elif ext == ".mp3":
        source_codec = "mp3"
    elif ext in {".m4a", ".mp4", ".alac"}:
        source_codec = mp4_kind(info)
        if source_codec is None and ext == ".alac":
            source_codec = "alac"
    else:
        codec = getattr(info, "codec", None)
        if codec:
            source_codec = str(codec).lower()

    bitrate_kbps: int | None = None
    raw_br = getattr(info, "bitrate", None)
    if raw_br is not None:
        try:
            bps = int(raw_br)
            if bps > 0:
                bitrate_kbps = int(round(bps / 1000))
                if bitrate_kbps <= 0:
                    bitrate_kbps = None
        except (TypeError, ValueError):
            bitrate_kbps = None

    return {
        "sample_rate_hz": sample_rate_hz,
        "bit_depth": bit_depth,
        "channels": channels,
        "source_codec": source_codec,
        "bitrate_kbps": bitrate_kbps,
    }


def read_metadata(path: Path) -> TrackMetadata:
    """
    Return common tags + source audio tech for a single audio file.

    Falls back to the filename stem when title is missing.
    Tech fields may be None when mutagen cannot determine them.
    """
    stem = path.stem
    title: str | None = stem
    artist: str | None = None
    album: str | None = None
    albumartist: str | None = None
    track: int | None = None
    disc: int | None = None
    year: int | None = None
    duration: float | None = None
    sample_rate_hz: int | None = None
    bit_depth: int | None = None
    channels: int | None = None
    source_codec: str | None = None
    bitrate_kbps: int | None = None
    bitrate_mode: str | None = None

    try:
        audio = MutagenFile(path, easy=True)
    except Exception:
        return TrackMetadata(
            title=title,
            artist=artist,
            album=album,
            albumartist=albumartist,
            track=track,
            disc=disc,
            year=year,
            duration=duration,
            sample_rate_hz=sample_rate_hz,
            bit_depth=bit_depth,
            channels=channels,
            source_codec=source_codec,
            bitrate_kbps=bitrate_kbps,
            bitrate_mode=bitrate_mode,
        )

    if audio is None:
        try:
            audio = MutagenFile(path)
        except Exception:
            return TrackMetadata(
                title=title,
                artist=artist,
                album=album,
                albumartist=albumartist,
                track=track,
                disc=disc,
                year=year,
                duration=duration,
                sample_rate_hz=sample_rate_hz,
                bit_depth=bit_depth,
                channels=channels,
                source_codec=source_codec,
                bitrate_kbps=bitrate_kbps,
                bitrate_mode=bitrate_mode,
            )
        if audio is None:
            return TrackMetadata(
                title=title,
                artist=artist,
                album=album,
                albumartist=albumartist,
                track=track,
                disc=disc,
                year=year,
                duration=duration,
                sample_rate_hz=sample_rate_hz,
                bit_depth=bit_depth,
                channels=channels,
                source_codec=source_codec,
                bitrate_kbps=bitrate_kbps,
                bitrate_mode=bitrate_mode,
            )

    info = getattr(audio, "info", None)
    if info is not None:
        if getattr(info, "length", None):
            duration = float(info.length)
        tech = _audio_tech_from_info(info, path)
        sample_rate_hz = tech["sample_rate_hz"]
        bit_depth = tech["bit_depth"]
        channels = tech["channels"]
        source_codec = tech["source_codec"]
        bitrate_kbps = tech["bitrate_kbps"]
        bitrate_mode = lossy_bitrate_mode(
            source_codec=source_codec,
            info=info,
            path=path,
        )

    tags = getattr(audio, "tags", None)
    if tags is None:
        return TrackMetadata(
            title=title,
            artist=artist,
            album=album,
            albumartist=albumartist,
            track=track,
            disc=disc,
            year=year,
            duration=duration,
            sample_rate_hz=sample_rate_hz,
            bit_depth=bit_depth,
            channels=channels,
            source_codec=source_codec,
            bitrate_kbps=bitrate_kbps,
            bitrate_mode=bitrate_mode,
        )

    if hasattr(tags, "get"):
        t_title = _first(tags, "title", "\xa9nam")
        t_artist = _first(tags, "artist", "\xa9ART")
        t_album = _first(tags, "album", "\xa9alb")
        t_albumartist = _first(
            tags,
            "albumartist",
            "album artist",
            "aART",
        )
        track_raw = _first(tags, "tracknumber", "trkn")
        disc_raw = _first(tags, "discnumber", "disknumber", "disk")
        year_raw = _first(tags, "date", "year", "\xa9day")

        if t_title:
            title = t_title
        if t_artist:
            artist = t_artist
        if t_album:
            album = t_album
        if t_albumartist:
            albumartist = t_albumartist
        track = _track_number(track_raw)
        disc = _track_number(disc_raw)
        year = _parse_year(year_raw)

        # MP4 non-easy fallbacks
        if isinstance(audio, MP4) and audio.tags:
            if track is None:
                trkn = audio.tags.get("trkn")
                if trkn and isinstance(trkn, list) and trkn[0]:
                    try:
                        track = int(trkn[0][0])
                    except (TypeError, ValueError, IndexError):
                        pass
            if disc is None:
                disk = audio.tags.get("disk")
                if disk and isinstance(disk, list) and disk[0]:
                    try:
                        disc = int(disk[0][0])
                    except (TypeError, ValueError, IndexError):
                        pass
            if not title or title == stem:
                nam = audio.tags.get("\xa9nam")
                if nam:
                    title = str(nam[0])
            if not artist:
                art = audio.tags.get("\xa9ART")
                if art:
                    artist = str(art[0])
            if not album:
                alb = audio.tags.get("\xa9alb")
                if alb:
                    album = str(alb[0])
            if not albumartist:
                aart = audio.tags.get("aART")
                if aart:
                    albumartist = str(aart[0])
            if year is None:
                day = audio.tags.get("\xa9day")
                if day:
                    year = _parse_year(str(day[0]))

    return TrackMetadata(
        title=title,
        artist=artist,
        album=album,
        albumartist=albumartist,
        track=track,
        disc=disc,
        year=year,
        duration=duration,
        sample_rate_hz=sample_rate_hz,
        bit_depth=bit_depth,
        channels=channels,
        source_codec=source_codec,
        bitrate_kbps=bitrate_kbps,
        bitrate_mode=bitrate_mode,
    )
