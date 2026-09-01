"""Collapse existing VA-alias artist/album rows onto the canonical VA artist."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from musicweb.cover import CoverStore
from musicweb.db.fts import fts_upsert
from musicweb.db.models import Album, Artist, Track
from musicweb.db.names import album_id_for
from musicweb.db.va import VA_DISPLAY_NAME, is_va_name
from musicweb.scan.identity import ensure_artist


def remount_va(session: Session, covers: CoverStore | None = None) -> int:
    """Rewrite alias album-artist / track-artist rows onto Various Artists.

    Returns the number of albums remounted plus tracks whose names/ids changed.
    """
    va = ensure_artist(session, VA_DISPLAY_NAME)
    aliases = [
        artist
        for artist in session.scalars(select(Artist)).all()
        if artist.id != va.id and is_va_name(artist.name)
    ]
    alias_ids = {artist.id for artist in aliases}
    touched_tracks: set[str] = set()
    albums_moved = 0

    for alias in aliases:
        albums = list(
            session.scalars(select(Album).where(Album.artist_id == alias.id)).all()
        )
        for album in albums:
            albums_moved += _remount_album(
                session, album, va.id, covers, touched_tracks
            )

    for track in session.scalars(select(Track)).all():
        changed = False
        if track.artist_id in alias_ids or is_va_name(track.artist_name):
            track.artist_id = va.id
            track.artist_name = VA_DISPLAY_NAME
            changed = True
        if track.album_artist_id in alias_ids or is_va_name(track.album_artist_name):
            track.album_artist_id = va.id
            track.album_artist_name = VA_DISPLAY_NAME
            changed = True
        if changed:
            touched_tracks.add(track.id)

    session.flush()
    _fts_touched(session, touched_tracks)

    for alias in aliases:
        still_albums = session.scalar(
            select(Album.id).where(Album.artist_id == alias.id).limit(1)
        )
        still_tracks = session.scalar(
            select(Track.id)
            .where(
                or_(
                    Track.artist_id == alias.id,
                    Track.album_artist_id == alias.id,
                )
            )
            .limit(1)
        )
        if still_albums is None and still_tracks is None:
            session.delete(alias)

    session.flush()
    return albums_moved + len(touched_tracks)


def _remount_album(
    session: Session,
    album: Album,
    va_id: str,
    covers: CoverStore | None,
    touched_tracks: set[str],
) -> int:
    new_id = album_id_for(va_id, album.title_norm)
    if album.id == new_id and album.artist_id == va_id:
        return 0

    survivor = session.get(Album, new_id)
    tracks = list(
        session.scalars(select(Track).where(Track.album_id == album.id)).all()
    )
    if survivor is not None and survivor.id != album.id:
        for track in tracks:
            track.album_id = survivor.id
            track.album_artist_id = va_id
            track.album_artist_name = VA_DISPLAY_NAME
            touched_tracks.add(track.id)
        session.flush()
        if covers is not None:
            if not covers.store.has(survivor.id):
                covers.rekey(album.id, survivor.id)
                survivor.has_cover = covers.store.has(survivor.id)
            else:
                covers.store.delete(album.id)
        session.delete(album)
        session.flush()
        return 1

    new_album = Album(
        id=new_id,
        artist_id=va_id,
        title=album.title,
        title_norm=album.title_norm,
        year=album.year,
        track_count=album.track_count,
        duration_ms=album.duration_ms,
        has_cover=album.has_cover,
        lossy_kind=album.lossy_kind,
    )
    session.add(new_album)
    session.flush()
    for track in tracks:
        track.album_id = new_id
        track.album_artist_id = va_id
        track.album_artist_name = VA_DISPLAY_NAME
        touched_tracks.add(track.id)
    session.flush()
    if covers is not None:
        covers.rekey(album.id, new_id)
        new_album.has_cover = covers.store.has(new_id)
    session.delete(album)
    session.flush()
    return 1


def _fts_touched(session: Session, track_ids: set[str]) -> None:
    if not track_ids:
        return
    rows = list(
        session.scalars(select(Track).where(Track.id.in_(track_ids))).all()
    )
    for track in rows:
        album_title = track.album.title if track.album is not None else ""
        fts_upsert(
            session,
            track_id=track.id,
            title=track.title,
            artist_name=track.artist_name,
            album_title=album_title,
            album_artist_name=track.album_artist_name,
        )
