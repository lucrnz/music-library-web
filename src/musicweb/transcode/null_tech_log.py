"""Memoized warnings when stream/prepare runs without track audio tech."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from musicweb.db.models import Track

logger = logging.getLogger(__name__)

# Process-lifetime: at most one null-tech warning per track id.
_warned_track_ids: set[str] = set()


def warn_null_track_tech(track: Track) -> None:
    """Log once per track id when sample rate or bit depth is missing."""
    if track.sample_rate_hz is not None and track.bit_depth is not None:
        return
    tid = track.id
    if tid in _warned_track_ids:
        return
    _warned_track_ids.add(tid)
    logger.warning(
        "Track %s has null audio tech (sample_rate_hz=%s bit_depth=%s); "
        "encode will probe source file",
        tid,
        track.sample_rate_hz,
        track.bit_depth,
    )


def clear_null_tech_warnings() -> None:
    """Test helper: reset the memo set."""
    _warned_track_ids.clear()
