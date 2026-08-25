"""OS default directory for companion blob files (no env override)."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def default_companion_data_dir(
    home: Path,
    *,
    system: str,
    environ: dict[str, str] | os._Environ[str],
) -> Path:
    if system == "darwin":
        return home / "Library" / "Application Support" / "musicweb-companion"
    if system == "win32":
        local = environ.get("LOCALAPPDATA")
        if local:
            return Path(local) / "musicweb-companion"
        return home / "AppData" / "Local" / "musicweb-companion"
    xdg = environ.get("XDG_DATA_HOME")
    if xdg:
        return Path(xdg) / "musicweb-companion"
    return home / ".local" / "share" / "musicweb-companion"


def companion_data_dir() -> Path:
    return default_companion_data_dir(
        Path.home(),
        system=sys.platform,
        environ=os.environ,
    )
