"""Pure serializer: StationSnapshot → HTTP/WS dict."""

from __future__ import annotations

from datetime import datetime, timezone

from musicweb.radio.types import StationSnapshot
from musicweb.routes.serializers import track_dict


def serialize(snapshot: StationSnapshot, *, now: datetime | None = None) -> dict:
    """Face plus current track fields. Never includes upcoming/queue/batch."""
    if snapshot.face != "current" or snapshot.track is None:
        return {"face": snapshot.face}
    now = now or datetime.now(timezone.utc)
    body = {"face": "current"}
    body.update(track_dict(snapshot.track))
    pos = snapshot.position_seconds(now)
    if pos is None:
        pos = 0.0
    duration_s = (snapshot.duration_ms or 0) / 1000.0
    if pos < 0:
        pos = 0.0
    if duration_s and pos > duration_s:
        pos = duration_s
    body["position"] = float(pos)
    return body
