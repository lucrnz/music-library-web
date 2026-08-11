"""HTML page routes + SPA history-mode fallback."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from musicweb.config import Settings
from musicweb.pwa_shell import THEME_COLOR

PACKAGE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(PACKAGE_DIR / "templates"))

router = APIRouter()

# Paths that must not be captured by the SPA HTML fallback (API/static/PWA
# mounts normally win; keep guards if mount order is wrong).
_SPA_RESERVED_PREFIXES = ("api/", "static/")
_SPA_RESERVED_EXACT = frozenset({"sw.js", "manifest.webmanifest"})


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _spa_context(request: Request) -> dict:
    pub = _settings(request).public_origin
    # Inject origin only when it is a usable secure-context install URL.
    public_origin = pub.origin if (pub.origin and pub.secure) else ""
    return {
        "title": "Music Library",
        "config_json": json.dumps({"publicOrigin": public_origin}),
        "theme_color": THEME_COLOR,
    }


def _spa_shell(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html", _spa_context(request))


def _is_spa_reserved(full_path: str) -> bool:
    if full_path.startswith(_SPA_RESERVED_PREFIXES):
        return True
    return full_path in _SPA_RESERVED_EXACT


@router.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return _spa_shell(request)


@router.get("/{full_path:path}", response_class=HTMLResponse)
async def spa_fallback(request: Request, full_path: str) -> HTMLResponse:
    """Serve the Vue shell for client routes so refresh/deep links work.

    API, /static, and PWA routes are registered before this catch-all.
    Still reject api/, static/, sw.js, and manifest.webmanifest so a
    mis-ordered mount never returns HTML for them.
    """
    if _is_spa_reserved(full_path):
        raise HTTPException(status_code=404, detail="Not found")
    return _spa_shell(request)
