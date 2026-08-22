"""Stream, cover, prepare, forget, codecs — id-primary media."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from musicweb.cover import placeholder_webp
from musicweb.db.models import Album
from musicweb.db.repositories import tracks as tracks_repo
from musicweb.db.session import get_db
from musicweb.routes.deps import (
    cover_store,
    library,
    retain_stream_ids,
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
from musicweb.transcode.passthrough import SOURCE_TAG, passthrough_media, stream_intent

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
        if track.is_missing or not track.rel_path:
            raise HTTPException(status_code=404, detail="Track file is missing")
        resolved = lib.present_audio(track.rel_path)
        if resolved is None:
            raise HTTPException(status_code=404, detail="Audio file not found")
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
    if payload.codec != SOURCE_TAG:
        try:
            get_profile(payload.codec)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

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
    retained = retain_stream_ids(request)
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
            audio_path = lib.present_audio(track.rel_path)
    elif not album_id:
        raise HTTPException(
            status_code=400,
            detail="album_id or track_id is required",
        )

    if not resolved_album_id:
        return _placeholder_response(size)

    hit = store.store.get_path(resolved_album_id, size)
    if hit is not None:
        return FileResponse(hit, media_type="image/webp", headers=_COVER_HEADERS)

    if audio_path is not None:
        result = await run_in_threadpool(
            store.get_or_fill, resolved_album_id, audio_path
        )
        # Persist has_cover flag; get_db commits the session on success.
        album = db.get(Album, resolved_album_id)
        if album is not None:
            album.has_cover = store.store.has(resolved_album_id)
        item = result[size]
        if isinstance(item, Path):
            return FileResponse(item, media_type="image/webp", headers=_COVER_HEADERS)
        return Response(
            content=item,
            media_type="image/webp",
            headers=_PLACEHOLDER_HEADERS,
        )

    return _placeholder_response(size)
