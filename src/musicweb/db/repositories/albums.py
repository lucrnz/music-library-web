"""Album queries."""

from __future__ import annotations

from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from musicweb.db.models import Album


def count_with_tracks(session: Session) -> int:
    return (
        session.scalar(
            select(func.count()).select_from(Album).where(Album.track_count > 0)
        )
        or 0
    )


def list_with_tracks(
    session: Session,
    *,
    offset: int = 0,
    limit: int = 100,
    sort: Literal["title", "year"] = "title",
) -> list[Album]:
    if sort == "year":
        order = (Album.year.asc().nulls_last(), Album.title_norm)
    else:
        order = (Album.title_norm, Album.year.asc().nulls_last())
    return list(
        session.scalars(
            select(Album)
            .where(Album.track_count > 0)
            .options(selectinload(Album.album_artist))
            .order_by(*order)
            .offset(offset)
            .limit(limit)
        ).all()
    )


def get(session: Session, album_id: str) -> Album | None:
    return session.scalars(
        select(Album)
        .where(Album.id == album_id)
        .options(selectinload(Album.album_artist))
    ).first()


def list_for_artist(session: Session, artist_id: str) -> list[Album]:
    return list(
        session.scalars(
            select(Album)
            .where(Album.artist_id == artist_id, Album.track_count > 0)
            .order_by(Album.year.asc().nulls_last(), Album.title_norm)
        ).all()
    )


def search_by_title(session: Session, q: str, *, limit: int = 20) -> list[Album]:
    q_like = f"%{q.strip()}%"
    return list(
        session.scalars(
            select(Album)
            .where(Album.title.ilike(q_like), Album.track_count > 0)
            .options(selectinload(Album.album_artist))
            .order_by(Album.title_norm)
            .limit(limit)
        ).all()
    )
