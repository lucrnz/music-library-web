"""Shared types for lyrics resolution."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

LyricsStatus = Literal[
    "ok",
    "not_found",
    "error",
    "instrumental",
    "pending",
    "skipped",
]

LyricsSource = Literal["local_lrc", "local_tag", "lrclib"]


@dataclass
class LocalLyrics:
    """Lyrics found next to or inside an audio file."""

    plain_text: str | None
    synced_lrc: str | None
    source: LyricsSource
    is_synced: bool


@dataclass
class LyricsResult:
    """Outcome of resolving lyrics for one track (local and/or remote)."""

    ok: bool
    status: LyricsStatus
    source: str | None = None
    is_synced: bool = False
    plain_text: str | None = None
    synced_lrc: str | None = None
    provider_id: str | None = None
    detail: str | None = None
