"""Playlist queries and mutations."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from musicweb.db.models import Playlist, PlaylistTrack, Track
from musicweb.db.names import playlist_id_new
from musicweb.timeutil import utc_now_iso


def list_all(session: Session) -> list[tuple[Playlist, int]]:
    rows = session.scalars(select(Playlist).order_by(Playlist.name)).all()
    out: list[tuple[Playlist, int]] = []
    for pl in rows:
        count = (
            session.scalar(
                select(func.count())
                .select_from(PlaylistTrack)
                .where(PlaylistTrack.playlist_id == pl.id)
            )
            or 0
        )
        out.append((pl, count))
    return out


def get(session: Session, playlist_id: str) -> Playlist | None:
    return session.get(Playlist, playlist_id)


def create(session: Session, name: str) -> Playlist:
    now = utc_now_iso()
    pl = Playlist(
        id=playlist_id_new(),
        name=name.strip(),
        created_at=now,
        updated_at=now,
    )
    session.add(pl)
    session.flush()
    return pl


def rename(session: Session, playlist_id: str, name: str) -> Playlist | None:
    pl = session.get(Playlist, playlist_id)
    if pl is None:
        return None
    pl.name = name.strip()
    pl.updated_at = utc_now_iso()
    return pl


def delete(session: Session, playlist_id: str) -> bool:
    pl = session.get(Playlist, playlist_id)
    if pl is None:
        return False
    session.delete(pl)
    return True


def list_tracks(session: Session, playlist_id: str) -> list[PlaylistTrack]:
    return list(
        session.scalars(
            select(PlaylistTrack)
            .where(PlaylistTrack.playlist_id == playlist_id)
            .order_by(PlaylistTrack.position)
            .options(selectinload(PlaylistTrack.track).selectinload(Track.album))
        ).all()
    )


def replace_tracks(
    session: Session, playlist_id: str, track_ids: list[str]
) -> tuple[bool, list[str]]:
    """
    Replace playlist contents. Returns (ok, unknown_ids).
    ok is False if playlist missing.
    """
    pl = session.get(Playlist, playlist_id)
    if pl is None:
        return False, []
    unknown: list[str] = []
    if track_ids:
        existing = set(
            session.scalars(select(Track.id).where(Track.id.in_(track_ids))).all()
        )
        unknown = [t for t in track_ids if t not in existing]
        if unknown:
            return True, unknown
    items = session.scalars(
        select(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist_id)
    ).all()
    for item in items:
        session.delete(item)
    session.flush()
    for pos, tid in enumerate(track_ids):
        session.add(
            PlaylistTrack(playlist_id=playlist_id, position=pos, track_id=tid)
        )
    pl.updated_at = utc_now_iso()
    return True, []


def append_tracks(session: Session, playlist_id: str, track_ids: list[str]) -> int | None:
    """Append known track ids. Returns added count, or None if playlist missing."""
    pl = session.get(Playlist, playlist_id)
    if pl is None:
        return None
    if not track_ids:
        return 0
    existing_ids = set(
        session.scalars(select(Track.id).where(Track.id.in_(track_ids))).all()
    )
    max_pos = session.scalar(
        select(func.max(PlaylistTrack.position)).where(
            PlaylistTrack.playlist_id == playlist_id
        )
    )
    pos = (max_pos + 1) if max_pos is not None else 0
    added = 0
    for tid in track_ids:
        if tid not in existing_ids:
            continue
        session.add(
            PlaylistTrack(playlist_id=playlist_id, position=pos, track_id=tid)
        )
        pos += 1
        added += 1
    pl.updated_at = utc_now_iso()
    return added
