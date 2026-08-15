"""Client diagnostic ingest. Does not call emit (no recursion)."""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from starlette.responses import Response

from musicweb.diag.envelope import envelope
from musicweb.diag.store import append_many

router = APIRouter(prefix="/api", tags=["diag"])

_EVENT_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$")
_MAX_DATA_BYTES = 8 * 1024


class ClientEvent(BaseModel):
    event: str = Field(..., min_length=1, max_length=128)
    level: Literal["info", "warn", "error"] | None = None
    ts: str | None = None
    client_id: str | None = None
    session_id: str | None = None
    play_id: str | None = None
    data: dict[str, Any] | None = None

    @field_validator("event")
    @classmethod
    def dotted_event(cls, value: str) -> str:
        text = value.strip()
        if not _EVENT_NAME.match(text):
            raise ValueError("event must be a dotted name")
        return text


class IngestBody(BaseModel):
    events: list[ClientEvent] = Field(...)


@router.post("/diag/events")
def ingest_events(request: Request, payload: IngestBody) -> Response:
    if len(payload.events) > 100:
        raise HTTPException(status_code=400, detail="too many events")
    settings = getattr(request.app.state, "settings", None)
    directory = getattr(settings, "diag_dir", None)
    if directory is None:
        raise HTTPException(status_code=500, detail="diag store unavailable")
    prepared: list[dict[str, Any]] = []
    for item in payload.events:
        data = item.data if item.data is not None else {}
        blob = json.dumps(data, ensure_ascii=False, allow_nan=False)
        if len(blob.encode("utf-8")) > _MAX_DATA_BYTES:
            raise HTTPException(status_code=400, detail="event data too large")
        prepared.append(
            envelope(
                source="client",
                event=item.event,
                level=item.level,
                client_id=item.client_id or None,
                session_id=item.session_id or None,
                play_id=item.play_id or None,
                data=data,
                ts=item.ts,
            )
        )
    append_many(directory, prepared)
    return Response(status_code=204)
