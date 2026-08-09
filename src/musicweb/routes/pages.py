"""HTML page routes + SPA history-mode fallback."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

PACKAGE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(PACKAGE_DIR / "templates"))

router = APIRouter()

_SPA_CONTEXT = {"title": "Music Library"}


def _spa_shell(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html", _SPA_CONTEXT)


@router.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return _spa_shell(request)


@router.get("/{full_path:path}", response_class=HTMLResponse)
async def spa_fallback(request: Request, full_path: str) -> HTMLResponse:
    """Serve the Vue shell for client routes so refresh/deep links work.

    Registered on the pages router; API and /static are registered after
    or as mounts and take precedence for their paths. Still reject api/
    and static/ here so a mis-ordered mount never returns HTML for them.
    """
    if full_path.startswith("api/") or full_path.startswith("static/"):
        raise HTTPException(status_code=404, detail="Not found")
    return _spa_shell(request)
