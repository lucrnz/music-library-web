"""PWA endpoints: web app manifest and generated service worker."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from musicweb.config import Settings
from musicweb.pwa_shell import BACKGROUND_COLOR, THEME_COLOR, render_service_worker

router = APIRouter(tags=["pwa"])


def _settings(request: Request) -> Settings:
    return request.app.state.settings


@router.get("/manifest.webmanifest")
async def web_manifest(request: Request) -> JSONResponse:
    """Dynamic web app manifest; absolute start_url/id when public origin is set."""
    pub = _settings(request).public_origin
    # Prefer secure configured origin for install identity; else relative URLs.
    origin = pub.origin if (pub.origin and pub.secure) else None
    start_url = f"{origin}/" if origin else "/"
    scope = f"{origin}/" if origin else "/"
    manifest_id = f"{origin}/" if origin else "/"

    body = {
        "name": "Music Library",
        "short_name": "MusicLib",
        "description": "Browse and stream your lossless music library",
        "id": manifest_id,
        "start_url": start_url,
        "scope": scope,
        "display": "standalone",
        "orientation": "any",
        "background_color": BACKGROUND_COLOR,
        "theme_color": THEME_COLOR,
        "icons": [
            {
                "src": "/static/img/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": "/static/img/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": "/static/img/icon-maskable-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable",
            },
        ],
    }
    return JSONResponse(
        content=body,
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/sw.js")
async def service_worker() -> Response:
    """Root-scoped service worker generated from on-disk shell inventory."""
    body = render_service_worker()
    return Response(
        content=body,
        media_type="application/javascript; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Service-Worker-Allowed": "/",
        },
    )
