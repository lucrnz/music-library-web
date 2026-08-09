"""Track queries."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from musicweb.db.models import Track


def get(session: Session, track_id: str) -> Track | None:
    return session.scalars(
        select(Track)
        .where(Track.id == track_id)
        .options(selectinload(Track.album))
    ).first()


def get_many(session: Session, ids: list[str]) -> list[Track]:
    if not ids:
        return []
    rows = session.scalars(
        select(Track)
        .where(Track.id.in_(ids))
        .options(selectinload(Track.album))
    ).all()
    by_id = {t.id: t for t in rows}
    return [by_id[i] for i in ids if i in by_id]


def get_by_path(session: Session, rel_path: str) -> Track | None:
    return session.scalars(
        select(Track)
        .where(Track.rel_path == rel_path)
        .options(selectinload(Track.album))
    ).first()


def get_by_paths(session: Session, paths: list[str]) -> dict[str, Track]:
    if not paths:
        return {}
    rows = session.scalars(
        select(Track)
        .where(Track.rel_path.in_(paths))
        .options(selectinload(Track.album))
    ).all()
    return {t.rel_path: t for t in rows}


def id_map_for_paths(session: Session, paths: list[str]) -> dict[str, str]:
    if not paths:
        return {}
    rows = session.execute(
        select(Track.id, Track.rel_path).where(
            Track.rel_path.in_(paths), Track.is_missing.is_(False)
        )
    ).all()
    return {rel: tid for tid, rel in rows}


def list_for_album(session: Session, album_id: str) -> list[Track]:
    return list(
        session.scalars(
            select(Track)
            .where(Track.album_id == album_id, Track.is_missing.is_(False))
            .options(selectinload(Track.album))
            .order_by(
                Track.disc_no.asc().nulls_first(),
                Track.track_no.asc().nulls_last(),
                Track.title,
            )
        ).all()
    )


def count_present(session: Session) -> int:
    return (
        session.scalar(
            select(func.count()).select_from(Track).where(Track.is_missing.is_(False))
        )
        or 0
    )


def count_missing(session: Session) -> int:
    return (
        session.scalar(
            select(func.count()).select_from(Track).where(Track.is_missing.is_(True))
        )
        or 0
    )
