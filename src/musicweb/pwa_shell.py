"""Shell inventory and service worker generation for the installable PWA."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

PACKAGE_DIR = Path(__file__).resolve().parent
SW_TEMPLATE_PATH = PACKAGE_DIR / "sw.template.js"

FRONTEND_DIST_MISSING = "frontend dist missing; run: pnpm --dir frontend build"

# Chrome colors shared by HTML theme-color meta and web app manifest.
# Aligned with frontend/css/app.css (--bg).
THEME_COLOR = "#121212"
BACKGROUND_COLOR = "#121212"

# Skip non-runtime artifacts if present under dist/.
_SKIP_NAME_PARTS = (
    ".template.",
    ".map",
    ".partial",
)


def frontend_dist_dir() -> Path:
    """Checkout-root `frontend/dist` (PACKAGE_DIR is src/musicweb)."""
    return PACKAGE_DIR.parent.parent / "frontend" / "dist"


def require_frontend_dist() -> Path:
    """Return the dist dir, or raise if `index.html` is missing."""
    dist = frontend_dist_dir()
    if not (dist / "index.html").is_file():
        raise RuntimeError(FRONTEND_DIST_MISSING)
    return dist


def _should_skip_dist_file(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    if any(part.startswith(".") for part in rel.parts):
        return True
    name = path.name
    if name == "index.html":
        return True
    if any(part in name for part in _SKIP_NAME_PARTS):
        return True
    if name.endswith("~"):
        return True
    return False


def list_dist_urls(dist_dir: Path | None = None) -> list[str]:
    """Return sorted public URLs for runtime files under frontend/dist."""
    root = dist_dir or frontend_dist_dir()
    urls: list[str] = []
    if not root.is_dir():
        return urls
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if _should_skip_dist_file(path, root):
            continue
        rel = path.relative_to(root).as_posix()
        urls.append(f"/{rel}")
    return urls


def shell_precache_urls(dist_dir: Path | None = None) -> list[str]:
    """Full precache list: shell document + dist inventory."""
    return ["/"] + list_dist_urls(dist_dir)


def _inventory_fingerprint(urls: list[str], dist_dir: Path, template: str) -> str:
    """Stable short hash so SW cache name changes when shell assets change."""
    h = hashlib.sha256()
    h.update(template.encode("utf-8"))
    for url in urls:
        h.update(url.encode("utf-8"))
        if url == "/":
            continue
        path = dist_dir / url.lstrip("/")
        try:
            st = path.stat()
            h.update(f"{st.st_mtime_ns}:{st.st_size}".encode("ascii"))
        except OSError:
            h.update(b"missing")
    return h.hexdigest()[:12]


def render_service_worker(
    *,
    dist_dir: Path | None = None,
    template_path: Path | None = None,
) -> str:
    """Render the service worker script with injected precache list and version."""
    root = dist_dir or frontend_dist_dir()
    tpl_path = template_path or SW_TEMPLATE_PATH
    template = tpl_path.read_text(encoding="utf-8")
    urls = shell_precache_urls(root)
    version = _inventory_fingerprint(urls, root, template)
    body = template.replace(
        "__PRECACHE_URLS__",
        json.dumps(urls, separators=(",", ":")),
    ).replace(
        "__SHELL_CACHE_VERSION__",
        json.dumps(version),
    )
    if "__PRECACHE_URLS__" in body or "__SHELL_CACHE_VERSION__" in body:
        raise RuntimeError("SW template placeholders not fully replaced")
    logger.debug(
        "Rendered service worker: %d precache URLs, version=%s", len(urls), version
    )
    return body
