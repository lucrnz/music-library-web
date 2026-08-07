"""JSON / media API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from musicweb.cover import get_cover_full, get_cover_thumbnail
from musicweb.library import PathEscapeError
from musicweb.metadata import read_metadata
from musicweb.transcode import DEFAULT_PROFILE_TAG, PROFILES, get_profile

router = APIRouter(prefix="/api")


def _library(request: Request):
    return request.app.state.library


def _transcoder(request: Request):
    return request.app.state.transcoder


@router.get("/browse")
async def browse(
    request: Request,
    path: str = Query(default="", description="Library-relative path (empty = root)"),
) -> dict:
    lib = _library(request)
    try:
        return lib.browse(path)
    except PathEscapeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotADirectoryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/collect")
async def collect(
    request: Request,
    path: str = Query(default="", description="Directory or file to collect audio from"),
) -> dict:
    """Recursively list audio paths under a folder (for 'add folder to playlist')."""
    lib = _library(request)
    try:
        files = lib.collect_audio(path)
        return {"path": path, "files": files}
    except PathEscapeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/meta")
async def meta(
    request: Request,
    path: str = Query(..., description="Library-relative audio file path"),
) -> dict:
    lib = _library(request)
    try:
        resolved = lib.resolve(path)
    except PathEscapeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not resolved.is_file() or not lib.is_audio(resolved):
        raise HTTPException(status_code=404, detail="Audio file not found")

    data = read_metadata(resolved)
    data["path"] = path
    return data


@router.get("/stream")
async def stream(
    request: Request,
    path: str = Query(..., description="Library-relative audio file path"),
    codec: str = Query(
        default=DEFAULT_PROFILE_TAG,
        description=(
            "Stream profile tag: aac_256_44100 | opus_192_48000 | "
            "opus_160_48000 | flac_16_44100 | flac_16_48000"
        ),
    ),
) -> FileResponse:
    lib = _library(request)
    transcoder = _transcoder(request)
    try:
        resolved = lib.resolve(path)
    except PathEscapeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not resolved.is_file() or not lib.is_audio(resolved):
        raise HTTPException(status_code=404, detail="Audio file not found")

    if codec not in PROFILES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported codec profile {codec!r}; "
                f"allowed: {sorted(PROFILES)}"
            ),
        )

    profile = get_profile(codec)
    try:
        media_path = await run_in_threadpool(
            transcoder.ensure_stream, resolved, path, profile_tag=codec
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

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
    """Batch prewarm request: queue background transcodes for playlist paths."""

    paths: list[str] = Field(default_factory=list, max_length=1000)
    codec: str = DEFAULT_PROFILE_TAG
    replace: bool = False  # drop all pending prewarm jobs first (codec change)


@router.post("/transcode/prepare")
async def transcode_prepare(request: Request, payload: PrepareRequest) -> dict:
    """
    Queue background transcodes so playback starts instantly later.

    Best-effort: non-audio/missing paths are skipped, already-cached or
    in-flight jobs are not duplicated, and a pending-queue cap applies.
    Play requests (/api/stream) always preempt this queue.
    """
    lib = _library(request)
    transcoder = _transcoder(request)

    if payload.codec not in PROFILES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported codec profile {payload.codec!r}; "
                f"allowed: {sorted(PROFILES)}"
            ),
        )

    if payload.replace:
        transcoder.drop_pending_prewarm()

    counts = {"queued": 0, "already": 0, "ready": 0, "skipped": 0}
    for rel_path in payload.paths:
        try:
            resolved = lib.resolve(rel_path)
        except PathEscapeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not lib.is_audio(resolved):
            counts["skipped"] += 1
            continue
        try:
            result = transcoder.prepare(
                resolved, rel_path, profile_tag=payload.codec
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        counts[result] += 1
    return counts


@router.get("/cover")
async def cover(
    request: Request,
    path: str = Query(..., description="Library-relative audio file path"),
    size: str = Query(
        default="full",
        description="full = 800×800 lossless WebP; thumb = 200×200 WebP quality 90",
    ),
) -> Response:
    lib = _library(request)
    try:
        resolved = lib.resolve(path)
    except PathEscapeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not resolved.is_file() or not lib.is_audio(resolved):
        raise HTTPException(status_code=404, detail="Audio file not found")

    if size not in ("full", "thumb"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported size {size!r}; allowed: full, thumb",
        )

    if size == "thumb":
        data, media_type = get_cover_thumbnail(resolved)
    else:
        data, media_type = get_cover_full(resolved)

    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )
