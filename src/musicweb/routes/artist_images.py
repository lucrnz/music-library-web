"""Preferred + scanned artist portraits."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from musicweb.artist_images.preferred import (
    PreferredImageTooLarge,
    PreferredImageUndecodable,
    apply_preferred_upload,
    revert_preferred,
)
from musicweb.artist_images.resolve import (
    pick_artist_image_path,
    reconcile_artist_image_flags,
)
from musicweb.config import ARTIST_IMAGE_MAX_BYTES
from musicweb.cover import placeholder_webp
from musicweb.db.models import Artist
from musicweb.db.session import get_db
from musicweb.routes.deps import artist_image_store, preferred_artist_image_store
from musicweb.routes.serializers import artist_dict

router = APIRouter(prefix="/api", tags=["artist-images"])

_COVER_HEADERS = {"Cache-Control": "private, max-age=86400"}
_PLACEHOLDER_HEADERS = {"Cache-Control": "no-store"}


def _placeholder_response(size: str) -> Response:
    return Response(
        content=placeholder_webp(size),
        media_type="image/webp",
        headers=_PLACEHOLDER_HEADERS,
    )


@router.get("/artist-image")
async def artist_image(
    request: Request,
    artist_id: str = Query(...),
    size: Literal["full", "thumb"] = Query(default="full"),
    db: Session = Depends(get_db),
) -> Response:
    scanned = artist_image_store(request)
    preferred = preferred_artist_image_store(request)
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(status_code=404, detail="Artist not found")

    reconcile_artist_image_flags(
        artist,
        preferred.has(artist_id),
        scanned.has(artist_id),
    )
    hit = pick_artist_image_path(
        preferred.get_path(artist_id, size),
        scanned.get_path(artist_id, size),
    )
    if hit is not None:
        return FileResponse(hit, media_type="image/webp", headers=_COVER_HEADERS)

    return _placeholder_response(size)


@router.post("/artist-image")
async def artist_image_upload(
    request: Request,
    artist_id: str = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    store = preferred_artist_image_store(request)
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(status_code=404, detail="Artist not found")

    if file.size is not None and file.size > ARTIST_IMAGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large")
    data = await file.read(ARTIST_IMAGE_MAX_BYTES + 1)
    try:
        apply_preferred_upload(store, artist, data)
    except PreferredImageTooLarge as exc:
        raise HTTPException(status_code=413, detail="Image too large") from exc
    except PreferredImageUndecodable as exc:
        raise HTTPException(status_code=400, detail="Could not decode image") from exc
    return artist_dict(artist)


@router.delete("/artist-image")
def artist_image_delete(
    request: Request,
    artist_id: str = Query(...),
    db: Session = Depends(get_db),
) -> dict:
    store = preferred_artist_image_store(request)
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(status_code=404, detail="Artist not found")
    revert_preferred(store, artist)
    return artist_dict(artist)
