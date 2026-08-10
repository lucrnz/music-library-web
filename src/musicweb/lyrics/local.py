"""Read lyrics from sidecar .lrc files and embedded tags."""

from __future__ import annotations

import logging
from pathlib import Path

from mutagen import File as MutagenFile
from mutagen.mp4 import MP4

from musicweb.lyrics.parse import looks_like_lrc, normalize_lyrics_text, plain_from_lrc
from musicweb.lyrics.types import LocalLyrics, LyricsSource

logger = logging.getLogger(__name__)

# Common Vorbis / ID3-style keys for unsynced lyrics.
_TAG_LYRICS_KEYS = (
    "LYRICS",
    "UNSYNCEDLYRICS",
    "lyrics",
    "unsyncedlyrics",
)


def _decode_bytes(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _from_text(text: str | None, *, source: LyricsSource) -> LocalLyrics | None:
    cleaned = normalize_lyrics_text(text)
    if not cleaned:
        return None
    if looks_like_lrc(cleaned):
        return LocalLyrics(
            plain_text=plain_from_lrc(cleaned) or None,
            synced_lrc=cleaned,
            source=source,
            is_synced=True,
        )
    return LocalLyrics(
        plain_text=cleaned,
        synced_lrc=None,
        source=source,
        is_synced=False,
    )


def read_lrc_sidecar(audio_path: Path) -> LocalLyrics | None:
    """Load ``{stem}.lrc`` next to the audio file, if present."""
    lrc_path = audio_path.with_suffix(".lrc")
    if not lrc_path.is_file():
        return None
    try:
        data = lrc_path.read_bytes()
    except OSError as exc:
        logger.debug("lrc sidecar read failed %s: %s", lrc_path, exc)
        return None
    return _from_text(_decode_bytes(data), source="local_lrc")


def _as_str_list(value: object) -> list[str]:
    """Normalize a mutagen tag value into non-empty stripped strings."""
    if value is None:
        return []
    items = value if isinstance(value, list) else [value]
    out: list[str] = []
    for item in items:
        text = str(item).strip()
        if text:
            out.append(text)
    return out


def _values_for_keys(tags: object, keys: tuple[str, ...]) -> list[str]:
    """Collect string values for the given keys from a dict-like tag map."""
    if tags is None or not hasattr(tags, "get"):
        return []
    out: list[str] = []
    for key in keys:
        try:
            value = tags.get(key)
        except (KeyError, TypeError, ValueError):
            continue
        out.extend(_as_str_list(value))
    return out


def read_embedded_lyrics(audio_path: Path) -> LocalLyrics | None:
    """Read unsynced (or LRC-shaped) lyrics from audio tags."""
    try:
        audio = MutagenFile(str(audio_path))
    except Exception as exc:
        logger.debug("embedded lyrics open failed %s: %s", audio_path, exc)
        return None
    if audio is None:
        return None

    tags = getattr(audio, "tags", None)
    candidates = _values_for_keys(tags, _TAG_LYRICS_KEYS)
    if isinstance(audio, MP4):
        candidates.extend(_values_for_keys(tags, ("\xa9lyr",)))

    if not candidates:
        return None
    lrc_like = [c for c in candidates if looks_like_lrc(c)]
    chosen = lrc_like[0] if lrc_like else candidates[0]
    return _from_text(chosen, source="local_tag")


def read_local_lyrics(audio_path: Path) -> LocalLyrics | None:
    """Sidecar .lrc first, then embedded tags."""
    sidecar = read_lrc_sidecar(audio_path)
    if sidecar is not None:
        return sidecar
    return read_embedded_lyrics(audio_path)
