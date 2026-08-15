"""Stream, cover, prepare, codecs — id-primary media."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from musicweb.cover import placeholder_webp
from musicweb.db.models import Album, Artist, Track
from musicweb.db.repositories import tracks as tracks_repo
from musicweb.db.session import get_db
from musicweb.library import Library
from musicweb.routes.deps import artist_image_store, cover_store, library, transcoder
from musicweb.transcode import (
    DEFAULT_PROFILE_TAG,
    browser_profiles,
    exclusive_formats_payload,
    get_profile,
    tech_from_track,
)
from musicweb.transcode.null_tech_log import warn_null_track_tech
from musicweb.diag.emit import emit
from musicweb.transcode.passthrough import (
    SOURCE_TAG,
    StreamConflict,
    passthrough_media,
    plan_stream,
)

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


def _stream_fail_ctx(
    track_id: str | None,
    codec: str,
    *,
    status: int,
    detail: str,
) -> dict:
    return {
        "track_id": track_id,
        "play_source": "streaming",
        "profile": codec,
        "reason": detail,
        "connectivity": None,
        "codec": codec,
        "status": status,
        "detail": detail,
    }


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
        data=_stream_fail_ctx(track_id, codec, status=status, detail=detail),
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
    lib = library(request)
    track = tracks_repo.get(db, id)
    if track is None:
        _emit_stream_reject(
            request, id, codec, status=404, detail="Track not found"
        )
        raise HTTPException(status_code=404, detail="Track not found")
    try:
        resolved = _resolve_track_file(lib, track)
    except HTTPException as exc:
        _emit_stream_reject(
            request,
            id,
            codec,
            status=exc.status_code,
            detail=str(exc.detail),
        )
        raise
    try:
        plan = plan_stream(is_lossy=bool(track.is_lossy), codec=codec)
    except StreamConflict as exc:
        _emit_stream_reject(request, id, codec, status=409, detail=exc.message)
        raise HTTPException(status_code=409, detail=exc.message) from exc
    except ValueError as exc:
        _emit_stream_reject(request, id, codec, status=400, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if plan == "passthrough":
        media_type, ext = passthrough_media(track.source_codec)
        emit(
            request,
            "http.stream",
            level="info",
            data={"track_id": id, "codec": codec, "plan": "passthrough"},
        )
        return FileResponse(
            path=resolved,
            media_type=media_type,
            filename=f"{resolved.stem}.{resolved.suffix.lstrip('.') or ext}",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "private, max-age=3600",
            },
        )

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
    emit(
        request,
        "http.stream",
        level="info",
        data={"track_id": id, "codec": codec, "plan": "encode"},
    )
    return FileResponse(
        path=media_path,
        media_type=profile.media_type,
        filename=f"{resolved.stem}.{profile.extension}",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=3600",
        },
    )


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
    if payload.codec == SOURCE_TAG:
        counts = {"queued": 0, "already": 0, "ready": 0, "skipped": 0}
        counts["skipped"] = len(payload.ids)
        _emit_prepare(request, payload, counts)
        return counts
    try:
        get_profile(payload.codec)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.replace:
        tc.drop_pending_prewarm()

    counts = {"queued": 0, "already": 0, "ready": 0, "skipped": 0}
    if not payload.ids:
        _emit_prepare(request, payload, counts)
        return counts

    for t in tracks_repo.get_many(db, payload.ids):
        if t.is_missing or not t.rel_path:
            counts["skipped"] += 1
            continue
        if t.is_lossy:
            counts["skipped"] += 1
            continue
        try:
            resolved = lib.resolve(t.rel_path)
        except Exception:
            counts["skipped"] += 1
            continue
        if not resolved.is_file() or not lib.is_audio(resolved):
            counts["skipped"] += 1
            continue
        warn_null_track_tech(t)
        result = tc.prepare(
            resolved,
            t.rel_path,
            profile_tag=payload.codec,
            source_tech=tech_from_track(t),
            urgent=payload.urgent,
        )
        counts[result] += 1
    _emit_prepare(request, payload, counts)
    return counts


@router.post("/cache/clear")
async def cache_clear(
    request: Request,
    scope: list[Literal["streams"]] = Query(
        ...,
        description="Cache subtree(s) to wipe. Only streams (covers are persisted).",
    ),
) -> dict:
    scopes = set(scope)
    removed: dict[str, int] = {}
    if "streams" in scopes:
        removed["streams"] = await run_in_threadpool(transcoder(request).clear_cache)
    return {"removed": removed, "scopes": sorted(scopes)}


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
    store = artist_image_store(request)
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(status_code=404, detail="Artist not found")

    hit = store.image_path(artist_id, size)
    if hit is not None:
        return FileResponse(hit, media_type="image/webp", headers=_COVER_HEADERS)

    # Keep DB flag honest if files were deleted externally.
    if artist.has_image:
        artist.has_image = store.has_image(artist_id)

    return _placeholder_response(size)
