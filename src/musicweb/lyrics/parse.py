"""LRC / plain lyrics helpers."""

from __future__ import annotations

import re

# Timed line: [mm:ss.xx] or [mm:ss.xxx] or [mm:ss]
_LRC_TIME_RE = re.compile(
    r"\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]"
)
# Metadata tags like [ar:Artist], [ti:Title]
_LRC_META_RE = re.compile(r"^\[[a-zA-Z][^:\]]*:[^\]]*\]\s*$")


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
