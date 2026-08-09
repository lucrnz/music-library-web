"""Saved playlists (SQLite)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from musicweb.db.repositories import playlists as playlists_repo
from musicweb.db.session import get_db
from musicweb.routes.serializers import track_dict

router = APIRouter(prefix="/api", tags=["playlists"])


class PlaylistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class PlaylistRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class PlaylistTracksPut(BaseModel):
    track_ids: list[str] = Field(default_factory=list, max_length=5000)


class PlaylistTracksAppend(BaseModel):
    track_ids: list[str] = Field(default_factory=list, max_length=1000)


@router.get("/playlists")
def list_playlists(db: Session = Depends(get_db)) -> dict:
    items = []
    for pl, count in playlists_repo.list_all(db):
        items.append(
            {
                "id": pl.id,
                "name": pl.name,
                "track_count": count,
                "created_at": pl.created_at,
                "updated_at": pl.updated_at,
            }
        )
    return {"items": items}


@router.post("/playlists")
def create_playlist(payload: PlaylistCreate, db: Session = Depends(get_db)) -> dict:
    pl = playlists_repo.create(db, payload.name)
    return {
        "id": pl.id,
        "name": pl.name,
        "track_count": 0,
        "created_at": pl.created_at,
        "updated_at": pl.updated_at,
    }


@router.patch("/playlists/{playlist_id}")
def rename_playlist(
    playlist_id: str, payload: PlaylistRename, db: Session = Depends(get_db)
) -> dict:
    pl = playlists_repo.rename(db, playlist_id, payload.name)
    if pl is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return {"id": pl.id, "name": pl.name, "updated_at": pl.updated_at}


@router.delete("/playlists/{playlist_id}")
def delete_playlist(playlist_id: str, db: Session = Depends(get_db)) -> dict:
    if not playlists_repo.delete(db, playlist_id):
        raise HTTPException(status_code=404, detail="Playlist not found")
    return {"deleted": True, "id": playlist_id}


@router.get("/playlists/{playlist_id}/tracks")
def playlist_tracks(playlist_id: str, db: Session = Depends(get_db)) -> dict:
    pl = playlists_repo.get(db, playlist_id)
    if pl is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    items = playlists_repo.list_tracks(db, playlist_id)
    tracks = []
    for item in items:
        if item.track is None:
            tracks.append(
                {
                    "id": item.track_id,
                    "position": item.position,
                    "is_missing": True,
                    "title": "Missing track",
                    "artist": "",
                    "album": "",
                }
            )
        else:
            d = track_dict(item.track)
            d["position"] = item.position
            tracks.append(d)
    return {"id": pl.id, "name": pl.name, "items": tracks}


@router.put("/playlists/{playlist_id}/tracks")
def put_playlist_tracks(
    playlist_id: str, payload: PlaylistTracksPut, db: Session = Depends(get_db)
) -> dict:
    ok, unknown = playlists_repo.replace_tracks(db, playlist_id, payload.track_ids)
    if not ok:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown track ids: {unknown[:5]}",
        )
    return {"id": playlist_id, "track_count": len(payload.track_ids)}


@router.post("/playlists/{playlist_id}/tracks")
def append_playlist_tracks(
    playlist_id: str, payload: PlaylistTracksAppend, db: Session = Depends(get_db)
) -> dict:
    added = playlists_repo.append_tracks(db, playlist_id, payload.track_ids)
    if added is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return {"id": playlist_id, "added": added}
