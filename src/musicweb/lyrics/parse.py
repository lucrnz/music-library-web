"""LRC / plain lyrics helpers."""

from __future__ import annotations

import re

# Timed line: [mm:ss.xx] or [mm:ss.xxx] or [mm:ss]
_LRC_TIME_RE = re.compile(
    r"\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]"
)
# Metadata tags like [ar:Artist], [ti:Title]
_LRC_META_RE = re.compile(r"^\[[a-zA-Z][^:\]]*:[^\]]*\]\s*$")

# Parenthetical / bracketed annotation containing remaster(ed), e.g.
# "(Remastered)", "[2011 Remaster]", "{Remastered Version}".
_REMASTERED_BRACKET_RE = re.compile(
    r"\s*[\[\(\{][^\]\)\}]*remaster(?:ed)?[^\]\)\}]*[\]\)\}]",
    re.IGNORECASE,
)
# Trailing dash form: " - Remastered", " – 2011 Remaster", " — Remastered 2015".
_REMASTERED_DASH_RE = re.compile(
    r"\s*[-–—]\s*(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?\s*$",
    re.IGNORECASE,
)
_MULTI_SPACE_RE = re.compile(r"\s{2,}")


def strip_remastered_noise(text: str | None) -> str:
    """
    Remove remaster annotations from a track or album title for lyrics matching.

    Strips parenthetical/bracketed segments that contain ``remaster`` /
    ``remastered`` (any case), and common trailing dash forms. Does not alter
    stored library metadata — only the string used for remote lookup.
    """
    if not text:
        return ""
    cleaned = text
    prev: str | None = None
    while prev != cleaned:
        prev = cleaned
        cleaned = _REMASTERED_BRACKET_RE.sub("", cleaned)
        cleaned = _REMASTERED_DASH_RE.sub("", cleaned)
    cleaned = _MULTI_SPACE_RE.sub(" ", cleaned)
    return cleaned.strip(" \t-–—")


def looks_like_lrc(text: str) -> bool:
    """True when text contains at least one timed LRC stamp."""
    if not text or not text.strip():
        return False
    return _LRC_TIME_RE.search(text) is not None


def plain_from_lrc(text: str) -> str:
    """Strip timestamps and metadata tags; keep lyric lines."""
    lines: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if _LRC_META_RE.match(line):
            continue
        stripped = _LRC_TIME_RE.sub("", line).strip()
        if stripped:
            lines.append(stripped)
    return "\n".join(lines)


def normalize_lyrics_text(text: str | None) -> str | None:
    """Trim and collapse trailing whitespace; None if empty."""
    if text is None:
        return None
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    return cleaned or None
