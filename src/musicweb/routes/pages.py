"""HTML page routes + SPA history-mode fallback."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from musicweb.config import Settings
from musicweb.pwa_shell import require_frontend_dist

router = APIRouter()

# Paths that must not be captured by the SPA HTML fallback (API/static/PWA
# mounts normally win; keep guards if mount order is wrong).
_SPA_RESERVED_PREFIXES = ("api/", "static/", "assets/")
_SPA_RESERVED_EXACT = frozenset({"sw.js", "manifest.webmanifest"})

def shell_config_json(*, public_origin: str, dev_unlock_pwa: bool) -> str:
    """Compact JSON for ``#musicweb-config`` (must match frontend/index.html)."""
    return json.dumps(
        {"publicOrigin": public_origin, "devUnlockPwa": bool(dev_unlock_pwa)},
        separators=(",", ":"),
    )


EMPTY_CONFIG_JSON = shell_config_json(public_origin="", dev_unlock_pwa=False)
_EMPTY_CONFIG_TAG = (
    '<script type="application/json" id="musicweb-config">'
    + EMPTY_CONFIG_JSON
    + "</script>"
)


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _spa_shell(request: Request) -> HTMLResponse:
    pub = _settings(request).public_origin
    public_origin = pub.origin if (pub.origin and pub.secure) else ""
    html = (require_frontend_dist() / "index.html").read_text(encoding="utf-8")
    settings = _settings(request)
    replacement = (
        '<script type="application/json" id="musicweb-config">'
        + shell_config_json(
            public_origin=public_origin,
            dev_unlock_pwa=settings.musicweb_dev_unlock_pwa,
        )
        + "</script>"
    )
    if _EMPTY_CONFIG_TAG not in html:
        raise RuntimeError(
            "stale or hand-edited frontend dist: missing empty #musicweb-config"
        )
    return HTMLResponse(html.replace(_EMPTY_CONFIG_TAG, replacement, 1))


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

    API, /assets, /static, and PWA routes are registered before this catch-all.
    Still reject api/, assets/, static/, sw.js, and manifest.webmanifest so a
    mis-ordered mount never returns HTML for them.
    """
    if _is_spa_reserved(full_path):
        raise HTTPException(status_code=404, detail="Not found")
    return _spa_shell(request)
