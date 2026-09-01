"""Artist queries."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from musicweb.db.models import Artist
from musicweb.db.va import VA_ARTIST_ID, is_va_name


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


def ids_with_albums(session: Session, ids: list[str]) -> set[str]:
    wanted = [i for i in ids if i]
    if not wanted:
        return set()
    return set(
        session.scalars(
            select(Artist.id).where(
                Artist.id.in_(wanted),
                Artist.album_count > 0,
            )
        ).all()
    )


def search_by_name(session: Session, q: str, *, limit: int = 20) -> list[Artist]:
    needle = q.strip()
    q_like = f"%{needle}%"
    rows = list(
        session.scalars(
            select(Artist)
            .where(Artist.name.ilike(q_like), Artist.album_count > 0)
            .order_by(Artist.sort_name)
            .limit(limit)
        ).all()
    )
    if is_va_name(needle):
        va = session.get(Artist, VA_ARTIST_ID)
        if va is not None and va.album_count > 0:
            rows = [va] + [a for a in rows if a.id != va.id]
            rows = rows[:limit]
    return rows
