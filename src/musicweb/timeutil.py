"""Shared time helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utc_now_iso() -> str:
    """UTC timestamp as ISO-8601 without microseconds (DB / scan fields)."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_iso_utc(value: str | None) -> datetime | None:
    """Parse an ISO-8601 timestamp; treat naive values as UTC."""
    if not value:
        return None
    try:
        text = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def in_retry_cooldown(
    *,
    status: str | None,
    fetched_at: str | None,
    retry_days: int,
    retry_statuses: frozenset[str] | set[str] = frozenset({"not_found", "error"}),
    now: datetime | None = None,
) -> bool:
    """
    True when a miss/error row should not be re-attempted yet.

    Used by lyrics and artist-image scan phases with the same semantics.
    """
    if status not in retry_statuses:
        return False
    fetched = parse_iso_utc(fetched_at)
    if fetched is None:
        return False
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now < fetched + timedelta(days=retry_days)
