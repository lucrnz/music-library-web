"""Lyrics resolution: local files/tags and LRCLIB."""

from musicweb.lyrics.fetch import LyricsFetcher, match_fingerprint_for
from musicweb.lyrics.types import LyricsResult

__all__ = ["LyricsFetcher", "LyricsResult", "match_fingerprint_for"]
