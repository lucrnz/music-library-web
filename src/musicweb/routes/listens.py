"""Household listen ingest and rankings."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Literal, NamedTuple
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.responses import Response

from musicweb.db.repositories import listens as listens_repo
from musicweb.db.session import get_db
from musicweb.routes.serializers import artist_dict, track_dict
from musicweb.timeutil import parse_iso_utc

router = APIRouter(prefix="/api", tags=["listens"])

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_FUTURE_SLACK = timedelta(minutes=5)


class ListenValidationError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ListenIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=36)
    track_id: str = Field(..., min_length=1)
    profile: str = Field(..., min_length=1)
    play_source: Literal["streaming", "downloaded"]
    counted_at: str = Field(..., min_length=1)


class ParsedRange(NamedTuple):
    range: Literal["all", "7d", "30d"] | str
    since_utc: str | None
    month_key: str | None


def counted_at_not_in_future(counted_at: str, *, now: datetime) -> None:
    parsed = parse_iso_utc(counted_at)
    if parsed is None:
        raise ListenValidationError("counted_at is not a valid timestamp")
    if parsed > now + _FUTURE_SLACK:
        raise ListenValidationError("counted_at is in the future")


def host_timezone_name(tz) -> str:
    if isinstance(tz, ZoneInfo):
        return tz.key
    return "local"


def parse_range(raw: str | None, *, now: datetime, tz) -> ParsedRange:
    del tz
    token = (raw or "").strip()
    if token == "7d":
        since = (now - timedelta(days=7)).astimezone(timezone.utc).replace(
            microsecond=0
        ).isoformat()
        return ParsedRange(range="7d", since_utc=since, month_key=None)
    if token == "30d":
        since = (now - timedelta(days=30)).astimezone(timezone.utc).replace(
            microsecond=0
        ).isoformat()
        return ParsedRange(range="30d", since_utc=since, month_key=None)
    if _MONTH.fullmatch(token):
        return ParsedRange(range=token, since_utc=None, month_key=token)
    return ParsedRange(range="all", since_utc=None, month_key=None)


def _http_422(exc: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@router.post("/listens")
def post_listen(payload: ListenIn, db: Session = Depends(get_db)) -> Response:
    try:
        counted_at_not_in_future(payload.counted_at, now=datetime.now(timezone.utc))
        listens_repo.insert_listen(
            db,
            id=payload.id,
            track_id=payload.track_id,
            profile_tag=payload.profile,
            play_source=payload.play_source,
            counted_at=payload.counted_at,
        )
    except (
        ListenValidationError,
        listens_repo.ListenUnknownTrack,
        listens_repo.ListenBadCountedAt,
    ) as exc:
        raise _http_422(exc) from exc
    return Response(status_code=204)


@router.get("/listens/rankings")
def get_listen_rankings(
    range: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    now = datetime.now(timezone.utc)
    tz = datetime.now().astimezone().tzinfo
    parsed = parse_range(range, now=now, tz=tz)
    artists = listens_repo.rank_artists(
        db, since_utc=parsed.since_utc, month_key=parsed.month_key
    )
    tracks = listens_repo.rank_tracks(
        db, since_utc=parsed.since_utc, month_key=parsed.month_key
    )
    return {
        "range": parsed.range,
        "timezone": host_timezone_name(tz),
        "months": listens_repo.available_months(db),
        "artists": [
            {**artist_dict(artist), "play_count": count, "last_counted_at": last}
            for artist, count, last in artists
        ],
        "tracks": [
            {**track_dict(track), "play_count": count, "last_counted_at": last}
            for track, count, last in tracks
        ],
    }
