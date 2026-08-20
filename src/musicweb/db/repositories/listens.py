"""Listen-event insert and ranking queries."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from musicweb.db.models import Artist, ListenEvent, Track
from musicweb.timeutil import parse_iso_utc

RankTrack = tuple[Track, int, str]
RankArtist = tuple[Artist, int, str]


class ListenUnknownTrack(Exception):
    def __init__(self, track_id: str) -> None:
        self.track_id = track_id
        super().__init__(track_id)


class ListenBadCountedAt(Exception):
    def __init__(self, counted_at: str) -> None:
        self.counted_at = counted_at
        super().__init__(counted_at)


def month_key_for(counted_at: str, tz) -> str:
    parsed = parse_iso_utc(counted_at)
    if parsed is None:
        raise ListenBadCountedAt(counted_at)
    return parsed.astimezone(tz).strftime("%Y-%m")


def _normalized_counted_at(counted_at: str) -> str:
    parsed = parse_iso_utc(counted_at)
    if parsed is None:
        raise ListenBadCountedAt(counted_at)
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _host_tz():
    return datetime.now().astimezone().tzinfo


def insert_listen(
    session: Session,
    *,
    id: str,
    track_id: str,
    profile_tag: str,
    play_source: str,
    counted_at: str,
) -> Literal["inserted", "duplicate"]:
    if session.get(ListenEvent, id) is not None:
        return "duplicate"
    if session.get(Track, track_id) is None:
        raise ListenUnknownTrack(track_id)
    stored = _normalized_counted_at(counted_at)
    session.add(
        ListenEvent(
            id=id,
            track_id=track_id,
            profile_tag=profile_tag,
            play_source=play_source,
            counted_at=stored,
            month_key=month_key_for(stored, _host_tz()),
        )
    )
    session.flush()
    return "inserted"


def available_months(session: Session) -> list[str]:
    rows = session.scalars(
        select(ListenEvent.month_key)
        .distinct()
        .order_by(ListenEvent.month_key.desc())
    ).all()
    return list(rows)


def _listen_filters(*, since_utc: str | None, month_key: str | None):
    filters = []
    if since_utc is not None:
        filters.append(ListenEvent.counted_at >= since_utc)
    if month_key is not None:
        filters.append(ListenEvent.month_key == month_key)
    return filters


def rank_tracks(
    session: Session,
    *,
    since_utc: str | None,
    month_key: str | None,
    limit: int = 100,
) -> list[RankTrack]:
    stmt = (
        select(
            ListenEvent.track_id,
            func.count().label("play_count"),
            func.max(ListenEvent.counted_at).label("last_counted_at"),
        )
        .where(*_listen_filters(since_utc=since_utc, month_key=month_key))
        .group_by(ListenEvent.track_id)
        .order_by(func.count().desc(), func.max(ListenEvent.counted_at).desc())
        .limit(limit)
    )
    rows = session.execute(stmt).all()
    if not rows:
        return []
    ids = [row.track_id for row in rows]
    tracks = session.scalars(
        select(Track).where(Track.id.in_(ids)).options(selectinload(Track.album))
    ).all()
    by_id = {track.id: track for track in tracks}
    return [
        (by_id[row.track_id], int(row.play_count), row.last_counted_at)
        for row in rows
        if row.track_id in by_id
    ]


def rank_artists(
    session: Session,
    *,
    since_utc: str | None,
    month_key: str | None,
    limit: int = 100,
) -> list[RankArtist]:
    filters = [
        Track.artist_id.is_not(None),
        *_listen_filters(since_utc=since_utc, month_key=month_key),
    ]
    stmt = (
        select(
            Track.artist_id,
            func.count().label("play_count"),
            func.max(ListenEvent.counted_at).label("last_counted_at"),
        )
        .join(Track, Track.id == ListenEvent.track_id)
        .where(*filters)
        .group_by(Track.artist_id)
        .order_by(func.count().desc(), func.max(ListenEvent.counted_at).desc())
        .limit(limit)
    )
    rows = session.execute(stmt).all()
    if not rows:
        return []
    ids = [row.artist_id for row in rows]
    artists = session.scalars(select(Artist).where(Artist.id.in_(ids))).all()
    by_id = {artist.id: artist for artist in artists}
    return [
        (by_id[row.artist_id], int(row.play_count), row.last_counted_at)
        for row in rows
        if row.artist_id in by_id
    ]
