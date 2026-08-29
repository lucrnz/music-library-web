"""cd_identities lookups."""

from __future__ import annotations

from sqlalchemy.orm import Session

from musicweb.db.models import CdIdentity


def get(session: Session, discid: str) -> CdIdentity | None:
    return session.get(CdIdentity, discid)


def upsert_identity(
    session: Session,
    *,
    discid: str,
    release_mbid: str,
    toc_json: str,
    confirmed_at: str,
    album_id: str | None,
    album: str | None,
    artist: str | None,
    year: int | None,
    has_cover: bool,
    tracks_json: str | None,
) -> CdIdentity:
    row = session.get(CdIdentity, discid)
    if row is None:
        row = CdIdentity(
            discid=discid,
            release_mbid=release_mbid,
            toc_json=toc_json,
            confirmed_at=confirmed_at,
            album_id=album_id,
            album=album,
            artist=artist,
            year=year,
            has_cover=has_cover,
            tracks_json=tracks_json,
        )
        session.add(row)
    else:
        row.release_mbid = release_mbid
        row.toc_json = toc_json
        row.confirmed_at = confirmed_at
        row.album_id = album_id
        row.album = album
        row.artist = artist
        row.year = year
        row.has_cover = has_cover
        row.tracks_json = tracks_json
    session.flush()
    return row
