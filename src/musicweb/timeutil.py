"""Shared time helpers."""

from __future__ import annotations

from datetime import datetime, timezone


def utc_now_iso() -> str:
    """UTC timestamp as ISO-8601 without microseconds (DB / scan fields)."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
