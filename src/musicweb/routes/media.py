"""Stream, cover, prepare, forget, codecs — id-primary media."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from musicweb.cover import placeholder_webp
from musicweb.db.models import Album, Artist, Track
from musicweb.db.repositories import tracks as tracks_repo
from musicweb.db.session import get_db
from musicweb.library import Library
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
from musicweb.routes.serializers import artist_dict
from musicweb.routes.deps import (
    artist_image_store,
    cover_store,
    library,
    preferred_artist_image_store,
    transcoder,
)
from musicweb.transcode import (
    DEFAULT_PROFILE_TAG,
    browser_profiles,
    exclusive_formats_payload,
    get_profile,
    tech_from_track,
)
from musicweb.transcode.enqueue import enqueue_prepare
from musicweb.transcode.forget import resolve_forget
from musicweb.transcode.null_tech_log import warn_null_track_tech
from musicweb.diag.emit import emit
from musicweb.transcode.passthrough import passthrough_media, stream_intent

router = APIRouter(prefix="/api", tags=["media"])

# Real art is durable under MUSICWEB_DATA_DIR; placeholders are ephemeral and
# must not be cached or the browser will keep showing gray tiles after extract.
_COVER_HEADERS = {"Cache-Control": "private, max-age=86400"}
_PLACEHOLDER_HEADERS = {"Cache-Control": "no-store"}


def _placeholder_response(size: str) -> Response:
    return Response(
        content=placeholder_webp(size),
        media_type="image/webp",
        headers=_PLACEHOLDER_HEADERS,
    )


def _emit_prepare(request: Request, payload: PrepareRequest, counts: dict) -> None:
    emit(
        request,
        "http.prepare",
        level="info",
        data={
            "codec": payload.codec,
            "urgent": payload.urgent,
            "replace": payload.replace,
            **counts,
        },
    )


def _emit_stream_reject(
    request: Request,
    track_id: str | None,
    codec: str,
    *,
    status: int,
    detail: str,
) -> None:
    emit(
        request,
        "http.stream.reject",
        level="error",
        data={
            "track_id": track_id,
            "play_source": "streaming",
            "profile": codec,
            "reason": detail,
            "connectivity": None,
            "status": status,
            "detail": detail,
        },
    )


def _resolve_track_file(lib: Library, track: Track) -> Path:
    if track.is_missing or not track.rel_path:
        raise HTTPException(status_code=404, detail="Track file is missing")
    resolved = lib.resolve(track.rel_path)
    if not resolved.is_file() or not lib.is_audio(resolved):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return resolved


@router.get("/codecs")
async def codecs() -> dict:
    """Browser stream profiles only (exclusive FLAC tags are not listed)."""
    return {
        "codecs": [
            {
                "id": p.tag,
                "label": p.label,
                "kind": p.kind,
                "media_type": p.media_type,
                "can_play": p.can_play,
                "bitrate_kbps": p.bitrate_kbps,
                "bit_depth": p.bit_depth,
                "sample_rate": p.sample_rate,
            }
            for p in browser_profiles()
        ],
        "default": DEFAULT_PROFILE_TAG,
    }


@router.get("/exclusive-formats")
async def exclusive_formats() -> dict:
    """Full exclusive FLAC allowlist for Mac companion formatPolicy."""
    return exclusive_formats_payload()


@router.get("/stream")
async def stream(
    request: Request,
    id: str = Query(..., description="Track id"),
    codec: str = Query(default=DEFAULT_PROFILE_TAG),
    db: Session = Depends(get_db),
) -> FileResponse:
    try:
        lib = library(request)
        track = tracks_repo.get(db, id)
        if track is None:
            raise HTTPException(status_code=404, detail="Track not found")
        resolved = _resolve_track_file(lib, track)
        intent = stream_intent(is_lossy=bool(track.is_lossy), codec=codec)
        if intent.kind == "reject":
            raise HTTPException(status_code=intent.status, detail=intent.detail)

        if intent.kind == "passthrough":
            try:
                media_type, ext = passthrough_media(track.source_codec)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            media_path = resolved
            filename = f"{resolved.stem}.{resolved.suffix.lstrip('.') or ext}"
        else:
            profile = get_profile(codec)
            warn_null_track_tech(track)
            try:
                media_path = await run_in_threadpool(
                    transcoder(request).ensure_stream,
                    resolved,
                    track.rel_path,
                    profile_tag=codec,
                    source_tech=tech_from_track(track),
                )
            except Exception as exc:
                _emit_stream_reject(
                    request,
                    id,
                    codec,
                    status=500,
                    detail=f"{type(exc).__name__}: {exc}"[:300],
                )
                raise
            media_type = profile.media_type
            filename = f"{resolved.stem}.{profile.extension}"
        emit(
            request,
            "http.stream",
            level="info",
            data={"track_id": id, "codec": codec, "plan": intent.kind},
        )
        return FileResponse(
            path=media_path,
            media_type=media_type,
            filename=filename,
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "private, max-age=3600",
            },
        )
    except HTTPException as exc:
        _emit_stream_reject(
            request,
            id,
            codec,
            status=exc.status_code,
            detail=str(exc.detail),
        )
        raise


class PrepareRequest(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=1000)
    codec: str = DEFAULT_PROFILE_TAG
    replace: bool = False
    urgent: bool = False


@router.post("/transcode/prepare")
def transcode_prepare(
    request: Request,
    payload: PrepareRequest,
    db: Session = Depends(get_db),
) -> dict:
    lib = library(request)
    tc = transcoder(request)
    probe = stream_intent(is_lossy=False, codec=payload.codec)
    if probe.kind == "reject" and probe.status == 400:
        raise HTTPException(status_code=400, detail=probe.detail)

    if payload.replace:
        tc.drop_pending_prewarm()

    counts = enqueue_prepare(
        db,
        lib,
        tc,
        payload.ids,
        profile_tag=payload.codec,
        urgent=payload.urgent,
    )
    _emit_prepare(request, payload, counts)
    return counts


class ForgetRequest(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=1000)


@router.post("/transcode/forget")
async def transcode_forget(
    request: Request,
    payload: ForgetRequest,
    db: Session = Depends(get_db),
) -> dict:
    retained = request.app.state.radio.retained_track_ids()
    paths, forgotten, skipped = resolve_forget(db, payload.ids, retained)
    if paths:
        await request.app.state.stream_cache_idle.run_exclusive(
            lambda: transcoder(request).forget_paths(paths)
        )
    return {"forgotten": forgotten, "skipped": skipped}


@router.get("/cover")
async def cover(
    request: Request,
    album_id: str | None = Query(default=None),
    track_id: str | None = Query(default=None),
    size: Literal["full", "thumb"] = Query(default="full"),
    db: Session = Depends(get_db),
) -> Response:
    lib = library(request)
    store = cover_store(request)
    resolved_album_id = album_id
    audio_path: Path | None = None

    if track_id:
        track = tracks_repo.get(db, track_id)
        if track is None:
            raise HTTPException(status_code=404, detail="Track not found")
        resolved_album_id = track.album_id
        if not track.is_missing and track.rel_path:
            try:
                audio_path = lib.resolve(track.rel_path)
            except Exception:
                audio_path = None
    elif not album_id:
        raise HTTPException(
            status_code=400,
            detail="album_id or track_id is required",
        )

    if not resolved_album_id:
        return _placeholder_response(size)

    hit = store.cover_path(resolved_album_id, size)
    if hit is not None:
        return FileResponse(hit, media_type="image/webp", headers=_COVER_HEADERS)

    if audio_path is not None and audio_path.is_file():
        result = await run_in_threadpool(
            store.get_or_fill, resolved_album_id, audio_path
        )
        # Persist has_cover flag; get_db commits the session on success.
        album = db.get(Album, resolved_album_id)
        if album is not None:
            album.has_cover = store.has_cover(resolved_album_id)
        item = result[size]
        if isinstance(item, Path):
            return FileResponse(item, media_type="image/webp", headers=_COVER_HEADERS)
        return Response(
            content=item,
            media_type="image/webp",
            headers=_PLACEHOLDER_HEADERS,
        )

    return _placeholder_response(size)


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
        scanned.has_image(artist_id),
    )
    hit = pick_artist_image_path(
        preferred.get_path(artist_id, size),
        scanned.image_path(artist_id, size),
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
