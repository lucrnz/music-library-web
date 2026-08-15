"""Server-side diagnostic emit (request-thread; honors mode cutoff)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from starlette.requests import Request

from musicweb.diag.ids import DiagIds, from_request
from musicweb.diag.store import append

logger = logging.getLogger(__name__)

_LEVELS = frozenset({"info", "warn", "error"})


def utc_ts() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _store_dir(request: Request | None, store_dir: Path | None) -> Path | None:
    if store_dir is not None:
        return store_dir
    if request is None:
        return None
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        return None
    return getattr(settings, "diag_dir", None)


def emit(
    request: Request | None,
    event: str,
    *,
    level: str = "info",
    data: dict[str, Any] | None = None,
    store_dir: Path | None = None,
    ids: DiagIds | None = None,
) -> None:
    """Append a ``source=server`` line, or no-op on cutoff / I/O failure."""
    try:
        resolved = ids if ids is not None else from_request(request)
        lvl = level if level in _LEVELS else "info"
        if lvl != "error" and resolved.mode == "errors":
            return
        directory = _store_dir(request, store_dir)
        if directory is None:
            return
        record = {
            "ts": utc_ts(),
            "source": "server",
            "event": event,
            "level": lvl,
            "client_id": resolved.client_id,
            "session_id": resolved.session_id,
            "play_id": resolved.play_id,
            "data": data if isinstance(data, dict) else {},
        }
        append(directory, record)
    except Exception:
        logger.exception("diag emit failed")
