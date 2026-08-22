"""Household radio now-playing HTTP + WebSocket."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

from musicweb.radio.prepare import RadioPrepare
from musicweb.radio.protocol import (
    ACTION_CLOSE,
    ACTION_TUNE_IN,
    ACTION_TUNE_OUT,
    parse_client_payload,
)
from musicweb.radio.station import RadioStation
from musicweb.radio.tuners import TunerRegistry, apply_disconnect, apply_tune_in, apply_tune_out
from musicweb.radio.types import StationSnapshot
from musicweb.routes.serializers import track_dict

logger = logging.getLogger(__name__)


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

router = APIRouter(prefix="/api", tags=["radio"])


class NowPlayingHub:
    """In-process fan-out for radio now-playing snapshots."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    def add(self, ws: WebSocket) -> None:
        self._clients.add(ws)

    def discard(self, ws: WebSocket) -> None:
        self._clients.discard(ws)

    def schedule(self, payload: dict) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.broadcast(payload))

    async def broadcast(self, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)


def push_now_playing(
    station: RadioStation,
    hub: NowPlayingHub,
    *,
    now: datetime | None = None,
) -> dict:
    """Serialize the stashed snapshot and schedule a WS push. No SQLite."""
    payload = serialize(station.now_playing(), now=now)
    hub.schedule(payload)
    return payload


def bind_station_listener(
    station: RadioStation,
    hub: NowPlayingHub,
    prepare: RadioPrepare | None = None,
) -> None:
    """One event-loop listener: broadcast + prepare refresh after each tick."""

    def on_tick() -> None:
        push_now_playing(station, hub, now=datetime.now(timezone.utc))
        if prepare is not None:
            prepare.refresh()

    station.set_loop_listener(on_tick)


def _station(request: Request) -> RadioStation:
    return request.app.state.radio


@router.get("/radio/now")
def radio_now(request: Request) -> dict:
    station = _station(request)
    return serialize(station.now_playing(), now=datetime.now(timezone.utc))


@router.websocket("/radio/ws")
async def radio_ws(websocket: WebSocket) -> None:
    station: RadioStation = websocket.app.state.radio
    hub: NowPlayingHub = websocket.app.state.radio_hub
    tuners: TunerRegistry = websocket.app.state.radio_tuners
    prepare: RadioPrepare = websocket.app.state.radio_prepare
    conn_key = id(websocket)
    await websocket.accept()
    hub.add(websocket)
    try:
        await websocket.send_json(
            serialize(station.now_playing(), now=datetime.now(timezone.utc))
        )
        while True:
            raw = await websocket.receive_text()
            action, fields = parse_client_payload(raw)
            if action == ACTION_CLOSE:
                await websocket.close()
                break
            if action == ACTION_TUNE_IN:
                reply = apply_tune_in(
                    station, tuners, prepare, conn_key, fields.get("codec")
                )
                await websocket.send_json(reply)
            elif action == ACTION_TUNE_OUT:
                await websocket.send_json(apply_tune_out(tuners, conn_key))
    except WebSocketDisconnect:
        pass
    finally:
        apply_disconnect(tuners, conn_key)
        hub.discard(websocket)
