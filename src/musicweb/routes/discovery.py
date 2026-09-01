"""Artist / album / track discovery and search."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from musicweb.db.fts import fts_search_track_ids
from musicweb.db.models import TrackLyrics
from musicweb.db.repositories import albums as albums_repo
from musicweb.db.repositories import artists as artists_repo
from musicweb.db.repositories import tracks as tracks_repo
from musicweb.db.session import get_db
from musicweb.routes.serializers import album_dict, artist_dict, lyrics_dict, track_dict

router = APIRouter(prefix="/api", tags=["discovery"])


@router.get("/artists")
def list_artists(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict:
    return {
        "items": [artist_dict(a) for a in artists_repo.list_with_albums(db, offset=offset, limit=limit)],
        "offset": offset,
        "limit": limit,
        "total": artists_repo.count_with_albums(db),
    }


def _require_browsable_artist(db: Session, artist_id: str):
    artist = artists_repo.get(db, artist_id)
    if artist is None or artist.album_count == 0:
        raise HTTPException(status_code=404, detail="Artist not found")
    return artist


def _track_dicts(db: Session, tracks: list) -> list[dict]:
    browsable = artists_repo.ids_with_albums(
        db, [t.artist_id for t in tracks if t.artist_id]
    )
    return [
        track_dict(t, artist_browsable=bool(t.artist_id and t.artist_id in browsable))
        for t in tracks
    ]


@router.get("/artists/{artist_id}")
def get_artist(artist_id: str, db: Session = Depends(get_db)) -> dict:
    return artist_dict(_require_browsable_artist(db, artist_id))


@router.get("/artists/{artist_id}/albums")
def artist_albums(artist_id: str, db: Session = Depends(get_db)) -> dict:
    artist = _require_browsable_artist(db, artist_id)
    rows = albums_repo.list_for_artist(db, artist_id)
    return {
        "artist": artist_dict(artist),
        "items": [album_dict(a, artist_name=artist.name) for a in rows],
    }


@router.get("/albums")
def list_albums(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    sort: Literal["title", "year"] = Query("title"),
    db: Session = Depends(get_db),
) -> dict:
    return {
        "items": [
            album_dict(a)
            for a in albums_repo.list_with_tracks(db, offset=offset, limit=limit, sort=sort)
        ],
        "offset": offset,
        "limit": limit,
        "total": albums_repo.count_with_tracks(db),
    }


@router.get("/albums/{album_id}")
def get_album(album_id: str, db: Session = Depends(get_db)) -> dict:
    album = albums_repo.get(db, album_id)
    if album is None:
        raise HTTPException(status_code=404, detail="Album not found")
    return album_dict(album)


@router.get("/albums/{album_id}/tracks")
def album_tracks(album_id: str, db: Session = Depends(get_db)) -> dict:
    album = albums_repo.get(db, album_id)
    if album is None:
        raise HTTPException(status_code=404, detail="Album not found")
    return {
        "album": album_dict(album),
        "items": _track_dicts(db, tracks_repo.list_for_album(db, album_id)),
    }


@router.get("/tracks/{track_id}")
def get_track(track_id: str, db: Session = Depends(get_db)) -> dict:
    track = tracks_repo.get(db, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return _track_dicts(db, [track])[0]


@router.get("/tracks/{track_id}/lyrics")
def get_track_lyrics(track_id: str, db: Session = Depends(get_db)) -> dict:
    """Return cached lyrics for a track (filled by the post-scan lyrics phase)."""
    track = tracks_repo.get(db, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    row = db.get(TrackLyrics, track_id)
    return lyrics_dict(track_id, row)


class TracksMetaRequest(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=1000)


@router.post("/tracks/meta")
def tracks_meta(payload: TracksMetaRequest, db: Session = Depends(get_db)) -> dict:
    return {"results": _track_dicts(db, tracks_repo.get_many(db, payload.ids))}


@router.get("/search")
def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    track_ids = fts_search_track_ids(db, q, limit=limit)
    tracks = _track_dicts(
        db,
        [t for t in tracks_repo.get_many(db, track_ids) if not t.is_missing],
    )
    return {
        "q": q,
        "artists": [artist_dict(a) for a in artists_repo.search_by_name(db, q)],
        "albums": [album_dict(a) for a in albums_repo.search_by_title(db, q)],
        "tracks": tracks,
    }
