"""Artist queries."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from musicweb.db.models import Artist


def count_with_albums(session: Session) -> int:
    return (
        session.scalar(
            select(func.count()).select_from(Artist).where(Artist.album_count > 0)
        )
        or 0
    )


def list_with_albums(
    session: Session, *, offset: int = 0, limit: int = 100
) -> list[Artist]:
    return list(
        session.scalars(
            select(Artist)
            .where(Artist.album_count > 0)
            .order_by(Artist.sort_name, Artist.name)
            .offset(offset)
            .limit(limit)
        ).all()
    )


def get(session: Session, artist_id: str) -> Artist | None:
    return session.get(Artist, artist_id)


def search_by_name(session: Session, q: str, *, limit: int = 20) -> list[Artist]:
    q_like = f"%{q.strip()}%"
    return list(
        session.scalars(
            select(Artist)
            .where(Artist.name.ilike(q_like), Artist.album_count > 0)
            .order_by(Artist.sort_name)
            .limit(limit)
        ).all()
    )
