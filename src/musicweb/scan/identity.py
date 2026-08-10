"""Track identity resolution and metadata application for the scanner."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from musicweb.db.fts import fts_upsert
from musicweb.db.models import Album, Artist, Track
from musicweb.db.names import (
    UNKNOWN_ALBUM,
    UNKNOWN_ARTIST,
    album_id_for,
    artist_id_for,
    display_name,
    normalize_name,
    sort_name,
)
from musicweb.metadata import TrackMetadata


def ensure_artist(session: Session, display: str) -> Artist:
    name = display_name(display, UNKNOWN_ARTIST)
    name_norm = normalize_name(name) or normalize_name(UNKNOWN_ARTIST)
    artist_id = artist_id_for(name_norm)
    artist = session.get(Artist, artist_id)
    if artist is None:
        artist = Artist(
            id=artist_id,
            name=name,
            name_norm=name_norm,
            sort_name=sort_name(name),
            album_count=0,
            track_count=0,
        )
        session.add(artist)
        session.flush()
    return artist


def ensure_album(
    session: Session,
    album_artist: Artist,
    album_title: str,
    year: int | None,
) -> Album:
    title = display_name(album_title, UNKNOWN_ALBUM)
    title_norm = normalize_name(title) or normalize_name(UNKNOWN_ALBUM)
    album_id = album_id_for(album_artist.id, title_norm)
    album = session.get(Album, album_id)
    if album is None:
        album = Album(
            id=album_id,
            artist_id=album_artist.id,
            title=title,
            title_norm=title_norm,
            year=year,
            track_count=0,
            has_cover=False,
        )
        session.add(album)
        session.flush()
    elif year is not None and album.year is None:
        album.year = year
    return album


def _new_track(
    *,
    track_id: str,
    fingerprint: str,
    fingerprint_algo: str,
    rel_path: str,
    now: str,
) -> Track:
    return Track(
        id=track_id,
        fingerprint=fingerprint,
        fingerprint_algo=fingerprint_algo,
        rel_path=rel_path,
        title="",
        artist_name=UNKNOWN_ARTIST,
        album_artist_name=UNKNOWN_ARTIST,
        size_bytes=0,
        mtime_ns=0,
        is_missing=False,
        added_at=now,
        indexed_at=now,
    )


def resolve_track(
    session: Session,
    *,
    fingerprint: str,
    fingerprint_algo: str,
    track_id: str,
    rel_path: str,
    existing_by_path: Track | None,
    now: str,
) -> Track:
    """
    Return the Track row that should own this file.

    - Same fingerprint → reattach / keep id (playlist-stable).
    - Same path, new fingerprint → mark old missing (rel_path NULL), insert new.
    - Else insert new.
    """
    by_fp = session.execute(
        select(Track).where(Track.fingerprint == fingerprint)
    ).scalar_one_or_none()

    if by_fp is not None:
        # Free path if another present row holds it
        if (
            existing_by_path is not None
            and existing_by_path.id != by_fp.id
            and existing_by_path.fingerprint != fingerprint
        ):
            existing_by_path.is_missing = True
            existing_by_path.rel_path = None
            session.flush()
        by_fp.rel_path = rel_path
        by_fp.fingerprint_algo = fingerprint_algo
        by_fp.is_missing = False
        return by_fp

    if existing_by_path is not None:
        if existing_by_path.fingerprint != fingerprint:
            existing_by_path.is_missing = True
            existing_by_path.rel_path = None
            session.flush()
            track = _new_track(
                track_id=track_id,
                fingerprint=fingerprint,
                fingerprint_algo=fingerprint_algo,
                rel_path=rel_path,
                now=now,
            )
            session.add(track)
            session.flush()
            return track
        existing_by_path.is_missing = False
        existing_by_path.rel_path = rel_path
        return existing_by_path

    track = _new_track(
        track_id=track_id,
        fingerprint=fingerprint,
        fingerprint_algo=fingerprint_algo,
        rel_path=rel_path,
        now=now,
    )
    session.add(track)
    session.flush()
    return track


def apply_track_fields(
    session: Session,
    track: Track,
    *,
    path: Path,
    size: int,
    mtime_ns: int,
    meta: TrackMetadata,
    now: str,
) -> str:
    """
    Apply tags + file stats to track, ensure artist/album, update FTS.
    Returns album_id.
    """
    title = display_name(meta.title, path.stem)
    artist_name = display_name(meta.artist, UNKNOWN_ARTIST)
    album_title = display_name(meta.album, UNKNOWN_ALBUM)
    albumartist_raw = meta.albumartist or meta.artist or ""
    album_artist_name = display_name(albumartist_raw, artist_name)

    track_artist = ensure_artist(session, artist_name)
    album_artist = ensure_artist(session, album_artist_name)
    year = meta.year
    album = ensure_album(session, album_artist, album_title, year)

    duration_ms = int(meta.duration * 1000) if meta.duration is not None else None

    track.title = title
    track.artist_name = artist_name
    track.album_artist_name = album_artist_name
    track.artist_id = track_artist.id
    track.album_id = album.id
    track.album_artist_id = album_artist.id
    track.track_no = meta.track
    track.disc_no = meta.disc
    track.year = year
    track.duration_ms = duration_ms
    track.sample_rate_hz = meta.sample_rate_hz
    track.bit_depth = meta.bit_depth
    track.channels = meta.channels
    track.source_codec = meta.source_codec
    track.size_bytes = size
    track.mtime_ns = mtime_ns
    track.is_missing = False
    track.indexed_at = now
    if not track.added_at:
        track.added_at = now

    session.flush()
    fts_upsert(
        session,
        track_id=track.id,
        title=track.title,
        artist_name=track.artist_name,
        album_title=album.title,
        album_artist_name=track.album_artist_name,
    )
    return album.id
