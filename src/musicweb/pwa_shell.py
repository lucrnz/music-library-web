"""Shell inventory and service worker generation for the installable PWA."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

PACKAGE_DIR = Path(__file__).resolve().parent
STATIC_DIR = PACKAGE_DIR / "static"
SW_TEMPLATE_PATH = STATIC_DIR / "sw.template.js"

# Chrome colors shared by HTML theme-color meta and web app manifest.
# Aligned with static/css/app.css (--bg).
THEME_COLOR = "#121212"
BACKGROUND_COLOR = "#121212"

# Subtrees under static/ that form the offline app shell (not library media).
_SHELL_SUBDIRS = ("css", "js", "img", "vendor")

# Skip non-runtime artifacts if present under static/.
_SKIP_NAME_PARTS = (
    ".template.",
    ".map",
    ".partial",
)


def list_shell_static_urls(static_dir: Path | None = None) -> list[str]:
    """Return sorted `/static/...` paths for shell assets on disk."""
    root = static_dir or STATIC_DIR
    urls: list[str] = []
    for sub in _SHELL_SUBDIRS:
        base = root / sub
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            name = path.name
            if any(part in name for part in _SKIP_NAME_PARTS):
                continue
            if name.endswith("~") or name.startswith("."):
                continue
            rel = path.relative_to(root).as_posix()
            urls.append(f"/static/{rel}")
    return urls


def shell_precache_urls(static_dir: Path | None = None) -> list[str]:
    """Full precache list: shell document + static inventory."""
    return ["/"] + list_shell_static_urls(static_dir)


def _inventory_fingerprint(urls: list[str], static_dir: Path, template: str) -> str:
    """Stable short hash so SW cache name changes when shell assets change."""
    h = hashlib.sha256()
    h.update(template.encode("utf-8"))
    root = static_dir
    for url in urls:
        h.update(url.encode("utf-8"))
        if url == "/":
            continue
        if not url.startswith("/static/"):
            continue
        path = root / url[len("/static/") :]
        try:
            st = path.stat()
            h.update(f"{st.st_mtime_ns}:{st.st_size}".encode("ascii"))
        except OSError:
            h.update(b"missing")
    return h.hexdigest()[:12]


def render_service_worker(
    *,
    static_dir: Path | None = None,
    template_path: Path | None = None,
) -> str:
    """Render the service worker script with injected precache list and version."""
    root = static_dir or STATIC_DIR
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
