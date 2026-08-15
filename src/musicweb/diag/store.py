"""Append-only daily JSONL + size-cap rotation for diagnostic events."""

from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

from musicweb.config import DIAG_DIR_MAX_BYTES

_EVENTS_NAME = re.compile(r"^events-(\d{4}-\d{2}-\d{2})\.jsonl$")
_append_lock = threading.Lock()


def events_filename(day: datetime | None = None) -> str:
    """UTC calendar day file name ``events-YYYY-MM-DD.jsonl``."""
    when = day if day is not None else datetime.now(timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    else:
        when = when.astimezone(timezone.utc)
    return f"events-{when.date().isoformat()}.jsonl"


def append_many(
    directory: Path,
    records: list[dict],
    *,
    day: datetime | None = None,
    max_bytes: int = DIAG_DIR_MAX_BYTES,
) -> Path | None:
    """Append *records* as JSON lines under one lock, then rotate once."""
    if not records:
        return None
    for record in records:
        if not isinstance(record, dict):
            raise TypeError(f"diag record must be a dict, got {type(record)!r}")
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / events_filename(day)
    lines = "".join(
        json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n"
        for record in records
    )
    with _append_lock:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(lines)
        maybe_rotate(directory, max_bytes=max_bytes)
    return path


def append(
    directory: Path,
    record: dict,
    *,
    day: datetime | None = None,
    max_bytes: int = DIAG_DIR_MAX_BYTES,
) -> Path:
    """Serialize *record* as one JSON line and append. Returns the file path."""
    path = append_many(directory, [record], day=day, max_bytes=max_bytes)
    if path is None:
        raise RuntimeError("append_many returned None for a single record")
    return path


def maybe_rotate(directory: Path, *, max_bytes: int = DIAG_DIR_MAX_BYTES) -> None:
    """Delete oldest ``events-*.jsonl`` files while over *max_bytes*.

    Never deletes the only remaining matching file. Unreadable siblings are
    skipped; rotation must not raise into the caller.
    """
    try:
        files = event_files(directory)
    except OSError:
        return
    if len(files) < 2:
        return
    try:
        sizes = []
        total = 0
        for path in files:
            try:
                size = path.stat().st_size
            except OSError:
                continue
            sizes.append((path, size))
            total += size
    except OSError:
        return
    # Oldest first (ISO date in the name sorts).
    sizes.sort(key=lambda item: item[0].name)
    while total > max_bytes and len(sizes) >= 2:
        path, size = sizes.pop(0)
        try:
            path.unlink()
        except OSError:
            continue
        total -= size


def event_files(directory: Path) -> list[Path]:
    """Matching ``events-YYYY-MM-DD.jsonl`` files, oldest name first."""
    if not directory.is_dir():
        return []
    found: list[Path] = []
    for child in directory.iterdir():
        if not child.is_file():
            continue
        if _EVENTS_NAME.match(child.name):
            found.append(child)
    found.sort(key=lambda p: p.name)
    return found
