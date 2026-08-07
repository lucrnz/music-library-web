"""JSON / media API routes.

Error mapping lives in app-level exception handlers (see main.create_app):
PathEscapeError/NotADirectoryError/ValueError → 400, FileNotFoundError → 404,
PermissionError → 403, RuntimeError → 500. Routes stay straight-line; only
genuine flow-control HTTPExceptions (e.g. 404 in _resolve_audio) remain.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from musicweb.cover import CoverCache
from musicweb.library import Library, PathEscapeError
from musicweb.metadata import read_metadata
from musicweb.transcode import DEFAULT_PROFILE_TAG, PROFILES, get_profile

router = APIRouter(prefix="/api")


def _library(request: Request) -> Library:
    return request.app.state.library


def _transcoder(request: Request):
    return request.app.state.transcoder


def _cover_cache(request: Request) -> CoverCache:
    return request.app.state.cover_cache


def _resolve_audio(lib: Library, path: str) -> Path:
    """Resolve a library-relative path to an existing audio file or 404."""
    resolved = lib.resolve(path)
    if not resolved.is_file() or not lib.is_audio(resolved):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return resolved


@router.get("/browse")
async def browse(
    request: Request,
    path: str = Query(default="", description="Library-relative path (empty = root)"),
) -> dict:
    return _library(request).browse(path)


@router.get("/collect")
async def collect(
    request: Request,
    path: str = Query(default="", description="Directory or file to collect audio from"),
) -> dict:
    """Recursively list audio paths under a folder (for 'add folder to playlist')."""
    lib = _library(request)
    files = lib.collect_audio(path)
    return {"path": path, "files": files}


@router.get("/meta")
async def meta(
    request: Request,
    path: str = Query(..., description="Library-relative audio file path"),
) -> dict:
    resolved = _resolve_audio(_library(request), path)
    data = read_metadata(resolved)
    data["path"] = path
    return data


class MetaRequest(BaseModel):
    """Batch metadata request: one entry per path that resolves to audio."""

    paths: list[str] = Field(default_factory=list, max_length=1000)


def _read_metadata_batch(lib: Library, paths: list[str]) -> list[dict]:
    """Best-effort metadata reads, in request order; skips non-audio paths."""
    results: list[dict] = []
    for rel_path in paths:
        try:
            resolved = lib.resolve(rel_path)
        except PathEscapeError:
            continue
        if not resolved.is_file() or not lib.is_audio(resolved):
            continue
        data = read_metadata(resolved)
        data["path"] = rel_path
        results.append(data)
    return results


@router.post("/meta")
async def meta_batch(request: Request, payload: MetaRequest) -> dict:
    """
    Best-effort batch metadata (like /api/transcode/prepare): one metadata
    dict per request path, in request order, for paths that resolve to audio
    files; unresolvable/non-audio paths are skipped silently.
    """
    lib = _library(request)
    results = await run_in_threadpool(_read_metadata_batch, lib, payload.paths)
    return {"results": results}


@router.get("/codecs")
async def codecs() -> dict:
    """List stream profiles (single source of truth: the PROFILES table)."""
    return {
        "codecs": [
            {"id": p.tag, "label": p.label}
            for p in PROFILES.values()
        ],
        "default": DEFAULT_PROFILE_TAG,
    }


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
    resolved = _resolve_audio(lib, path)
    profile = get_profile(codec)
    media_path = await run_in_threadpool(
        transcoder.ensure_stream, resolved, path, profile_tag=codec
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

    get_profile(payload.codec)  # validate before any queue mutation

    if payload.replace:
        transcoder.drop_pending_prewarm()

    counts = {"queued": 0, "already": 0, "ready": 0, "skipped": 0}
    for rel_path in payload.paths:
        resolved = lib.resolve(rel_path)
        if not lib.is_audio(resolved):
            counts["skipped"] += 1
            continue
        result = transcoder.prepare(
            resolved, rel_path, profile_tag=payload.codec
        )
        counts[result] += 1
    return counts


CacheScope = Literal["streams", "covers"]


@router.post("/cache/clear")
async def cache_clear(
    request: Request,
    scope: list[CacheScope] = Query(
        ...,
        description=(
            "Cache subtree(s) to wipe. Repeat for multiple: "
            "?scope=streams&scope=covers"
        ),
    ),
) -> dict:
    """
    Wipe one or more process-cache subtrees.

    ``scope=streams`` drops queued/running encodes and clears ``streams/``.
    ``scope=covers`` clears ``covers/``. Repeat the param to clear both.
    Playlist clear uses ``?scope=streams`` only.
    """
    scopes = set(scope)
    removed: dict[str, int] = {}
    if "streams" in scopes:
        removed["streams"] = await run_in_threadpool(
            _transcoder(request).clear_cache
        )
    if "covers" in scopes:
        removed["covers"] = await run_in_threadpool(_cover_cache(request).clear)
    return {"removed": removed, "scopes": sorted(scopes)}


_COVER_HEADERS = {"Cache-Control": "private, max-age=86400"}


def _cover_result(
    cache: CoverCache, resolved: Path, rel_path: str, size: str
) -> Path | bytes:
    """Resolve cover art for an audio file.

    Returns a Path to a ready WebP on a cache hit (caller can FileResponse it),
    or raw bytes after a fill. Runs in a threadpool: hit cost is a mutagen tag
    read + path check; miss extracts once and caches both sizes.
    """
    album = read_metadata(resolved).get("album") or None
    key = cache.key_for(album, rel_path)
    hit = cache.cover_path(key, size)
    if hit is not None:
        return hit
    data = cache.get_or_fill(key, resolved)[size]
    # Prefer the on-disk file when the fill wrote successfully (zero-copy serve).
    written = cache.cover_path(key, size)
    return written if written is not None else data


@router.get("/cover")
async def cover(
    request: Request,
    path: str = Query(..., description="Library-relative audio file path"),
    size: Literal["full", "thumb"] = Query(
        default="full",
        description="full = 800×800 lossless WebP; thumb = 200×200 WebP quality 90",
    ),
) -> Response:
    lib = _library(request)
    resolved = _resolve_audio(lib, path)
    result = await run_in_threadpool(
        _cover_result, _cover_cache(request), resolved, path, size
    )
    if isinstance(result, Path):
        return FileResponse(
            result,
            media_type="image/webp",
            headers=_COVER_HEADERS,
        )
    return Response(
        content=result,
        media_type="image/webp",
        headers=_COVER_HEADERS,
    )
