"""Aggregate API routers (split modules under musicweb.routes)."""

from __future__ import annotations

from fastapi import APIRouter

from musicweb.routes import (
    diag,
    discovery,
    folders,
    health,
    library_scan,
    media,
    playlists,
)

router = APIRouter()
router.include_router(health.router)
router.include_router(library_scan.router)
router.include_router(discovery.router)
router.include_router(folders.router)
router.include_router(media.router)
router.include_router(playlists.router)
router.include_router(diag.router)
