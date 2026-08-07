"""JSON / media API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response

from musicweb.cover import get_cover_bytes
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
            "Stream profile tag: aac_256_44100 | opus_192_48000"
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
        media_path = transcoder.ensure_stream(
            resolved, path, profile_tag=codec
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


@router.get("/cover")
async def cover(
    request: Request,
    path: str = Query(..., description="Library-relative audio file path"),
) -> Response:
    lib = _library(request)
    try:
        resolved = lib.resolve(path)
    except PathEscapeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not resolved.is_file() or not lib.is_audio(resolved):
        raise HTTPException(status_code=404, detail="Audio file not found")

    data, media_type = get_cover_bytes(resolved)
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )
