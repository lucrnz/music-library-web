"""Canonical diagnostic record shape."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from musicweb.timeutil import parse_iso_utc

_LEVELS = frozenset({"info", "warn", "error"})


def utc_ts() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def envelope(
    *,
    source: str,
    event: str,
    level: str | None = None,
    client_id: str | None = None,
    session_id: str | None = None,
    play_id: str | None = None,
    data: Any = None,
    ts: str | None = None,
) -> dict[str, Any]:
    if ts and parse_iso_utc(ts) is not None:
        resolved_ts = ts
    else:
        resolved_ts = utc_ts()
    return {
        "ts": resolved_ts,
        "source": source,
        "event": event,
        "level": level if level in _LEVELS else "info",
        "client_id": client_id,
        "session_id": session_id,
        "play_id": play_id,
        "data": data if isinstance(data, dict) else {},
    }
