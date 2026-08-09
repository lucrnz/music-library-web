"""Frontend vendor assets: registry + download-on-startup from unpkg.

Pinned browser ESM builds are fetched into ``static/vendor/`` when missing
or when the registry version differs from the local manifest. No Node/npm.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

PACKAGE_DIR = Path(__file__).resolve().parent
VENDOR_DIR = PACKAGE_DIR / "static" / "vendor"
MANIFEST_NAME = "manifest.json"
DOWNLOAD_TIMEOUT_S = 30


@dataclass(frozen=True)
class VendorAsset:
    """One browser-side JS asset pinned to a CDN URL."""

    name: str
    version: str
    filename: str
    url: str


# Source of truth for frontend vendor packages. Bump version + URL here to
# refresh; ensure_vendor_assets() re-downloads when the manifest is stale.
VENDOR_ASSETS: tuple[VendorAsset, ...] = (
    VendorAsset(
        name="vue",
        version="3.5.18",
        filename="vue.esm-browser.prod.js",
        url="https://unpkg.com/vue@3.5.18/dist/vue.esm-browser.prod.js",
    ),
    VendorAsset(
        name="vue-router",
        version="4.5.1",
        filename="vue-router.esm-browser.prod.js",
        url="https://unpkg.com/vue-router@4.5.1/dist/vue-router.esm-browser.prod.js",
    ),
)


def _read_manifest(vendor_dir: Path) -> dict[str, str]:
    path = vendor_dir / MANIFEST_NAME
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Ignoring corrupt vendor manifest %s: %s", path, exc)
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for key, val in data.items():
        if isinstance(key, str) and isinstance(val, str):
            out[key] = val
    return out


def _write_manifest(vendor_dir: Path, versions: dict[str, str]) -> None:
    path = vendor_dir / MANIFEST_NAME
    path.write_text(
        json.dumps(versions, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _download(url: str, dest: Path) -> None:
    """Download url to dest via a temp file (atomic replace)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "musicweb-vendor-fetch/1.0"},
        )
        with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT_S) as resp:
            body = resp.read()
        if not body:
            raise RuntimeError(f"empty response from {url}")
        # Weak sanity: ESM/browser builds are non-trivial JS text.
        if len(body) < 100:
            raise RuntimeError(
                f"response from {url} is suspiciously small ({len(body)} bytes)"
            )
        tmp.write_bytes(body)
        tmp.replace(dest)
    except Exception:
        if tmp.is_file():
            try:
                tmp.unlink()
            except OSError:
                pass
        raise


def ensure_vendor_assets(vendor_dir: Path | None = None) -> list[str]:
    """Ensure all registered vendor assets are present at the pinned versions.

    Returns short status lines for the startup banner (one per asset).
    Raises RuntimeError if any required asset cannot be obtained.
    """
    vendor_dir = vendor_dir or VENDOR_DIR
    vendor_dir.mkdir(parents=True, exist_ok=True)

    manifest = _read_manifest(vendor_dir)
    new_manifest: dict[str, str] = {}
    lines: list[str] = []
    errors: list[str] = []

    for asset in VENDOR_ASSETS:
        dest = vendor_dir / asset.filename
        recorded = manifest.get(asset.filename)
        up_to_date = (
            dest.is_file()
            and dest.stat().st_size > 0
            and recorded == asset.version
        )
        if up_to_date:
            new_manifest[asset.filename] = asset.version
            lines.append(f"{asset.name}@{asset.version}: cached")
            continue

        reason = "missing" if not dest.is_file() else f"upgrade ({recorded or '?'} → {asset.version})"
        try:
            logger.info(
                "Fetching vendor %s@%s (%s) from %s",
                asset.name,
                asset.version,
                reason,
                asset.url,
            )
            _download(asset.url, dest)
            new_manifest[asset.filename] = asset.version
            lines.append(f"{asset.name}@{asset.version}: downloaded")
        except (urllib.error.URLError, TimeoutError, OSError, RuntimeError) as exc:
            msg = (
                f"Failed to fetch {asset.name}@{asset.version} from {asset.url}: {exc}"
            )
            logger.error(msg)
            errors.append(msg)
            # Keep previous manifest entry only if file still usable? No — fail hard.
            if dest.is_file() and dest.stat().st_size > 0 and recorded == asset.version:
                # Unreachable when up_to_date; left for clarity
                new_manifest[asset.filename] = asset.version

    if errors:
        detail = "; ".join(errors)
        raise RuntimeError(
            "Frontend vendor assets incomplete (need network on first fetch "
            f"or after version bumps): {detail}"
        )

    _write_manifest(vendor_dir, new_manifest)
    return lines
