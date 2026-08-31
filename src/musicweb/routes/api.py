"""Aggregate API routers (split modules under musicweb.routes)."""

from __future__ import annotations

from fastapi import APIRouter

from musicweb.routes import (
    artist_images,
    cd,
    diag,
    discovery,
    health,
    library_scan,
    media,
    playlists,
    radio,
)

router = APIRouter()
router.include_router(health.router)
router.include_router(library_scan.router)
router.include_router(discovery.router)
router.include_router(media.router)
router.include_router(artist_images.router)
router.include_router(playlists.router)
router.include_router(diag.router)
router.include_router(radio.router)
router.include_router(cd.router)
