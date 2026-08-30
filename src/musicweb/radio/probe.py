"""Pick-time ffprobe validity check (audio stream present)."""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from musicweb.runtime.spawn import run as spawn_run

logger = logging.getLogger(__name__)

_PROBE_TIMEOUT_S = 15


def file_is_playable(path: Path) -> bool:
    """True when ffprobe exits 0 and reports an audio stream. Timeout 15s."""
    try:
        proc = spawn_run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                str(path),
            ],
            capture_output=True,
            timeout=_PROBE_TIMEOUT_S,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.info("radio probe: ffprobe failed for %s: %s", path.name, exc)
        return False
    if proc.returncode != 0:
        return False
    out = (proc.stdout or b"").decode("utf-8", errors="replace").strip().lower()
    return "audio" in out
