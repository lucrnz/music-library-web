"""Startup checks for ffmpeg, ffprobe, encoders, and libsoxr."""

from __future__ import annotations

import logging
import re
import subprocess
from dataclasses import dataclass

logger = logging.getLogger(__name__)


def _require_tool(name: str, args: list[str], *, hint: str) -> str:
    """Run a version-style check; return first stdout/stderr line for logging."""
    try:
        proc = subprocess.run(
            [name, *args],
            capture_output=True,
            timeout=10,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(f"{name} not found on PATH. {hint}") from exc
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            f"{name} is installed but failed to run: {err or proc.returncode}"
        )
    out = (proc.stdout or b"").decode("utf-8", errors="replace").strip()
    if not out:
        out = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
    first = out.splitlines()[0] if out else name
    return first


def _ffmpeg_encoder_names() -> set[str]:
    """Parse `ffmpeg -encoders` into a set of encoder names."""
    try:
        proc = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True,
            timeout=15,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "ffmpeg not found on PATH. Install ffmpeg with libsoxr, "
            "libopus, and flac."
        ) from exc
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"ffmpeg -encoders failed: {err or proc.returncode}")

    text = (proc.stdout or b"").decode("utf-8", errors="replace")
    # Lines look like: " A....D libopus           libopus OPUS ..."
    names: set[str] = set()
    for line in text.splitlines():
        m = re.match(r"^\s*[A-Z\.]{6}\s+(\S+)", line)
        if m:
            names.add(m.group(1))
    return names


def _require_libsoxr() -> str:
    """Fail fast unless ffmpeg was built with libsoxr."""
    try:
        proc = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=10,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg not found on PATH.") from exc

    text = (proc.stdout or b"").decode("utf-8", errors="replace")
    # configuration: ... --enable-libsoxr ...
    if "--enable-libsoxr" not in text and "libsoxr" not in text.lower():
        # Secondary check: aresample filter docs list soxr
        try:
            h = subprocess.run(
                ["ffmpeg", "-hide_banner", "-h", "filter=aresample"],
                capture_output=True,
                timeout=10,
                check=False,
            )
            help_text = (h.stdout or b"").decode("utf-8", errors="replace")
            help_text += (h.stderr or b"").decode("utf-8", errors="replace")
        except FileNotFoundError as exc:
            raise RuntimeError("ffmpeg not found on PATH.") from exc
        if "soxr" not in help_text.lower():
            raise RuntimeError(
                "ffmpeg is missing libsoxr (high-quality resampler). "
                "Install/rebuild ffmpeg with --enable-libsoxr."
            )
    return "enabled (aresample resampler=soxr)"


@dataclass(frozen=True)
class DependencyReport:
    """Startup dependency check results: banner labels."""

    tools: dict[str, str]


def check_dependencies() -> DependencyReport:
    """
    Ensure ffmpeg and ffprobe are on PATH, and ffmpeg has libsoxr, libopus, and flac.

    Raises RuntimeError on any missing requirement (fail fast).
    """
    ffmpeg_ver = _require_tool(
        "ffmpeg",
        ["-version"],
        hint="Install ffmpeg with libsoxr, libopus, and flac.",
    )
    ffprobe_ver = _require_tool(
        "ffprobe",
        ["-version"],
        hint="Install ffmpeg (includes ffprobe) with libsoxr, libopus, and flac.",
    )
    soxr_label = _require_libsoxr()
    encoders = _ffmpeg_encoder_names()
    if "libopus" not in encoders:
        raise RuntimeError(
            "ffmpeg is missing the libopus encoder. "
            "Install/rebuild ffmpeg with --enable-libopus."
        )
    if "flac" not in encoders:
        raise RuntimeError(
            "ffmpeg is missing the flac encoder. "
            "Install a standard ffmpeg build that includes FLAC."
        )

    logger.info("Opus encoder: libopus")
    logger.info("FLAC encoder: flac")
    logger.info("Resampler: %s", soxr_label)

    return DependencyReport(
        tools={
            "ffmpeg": ffmpeg_ver,
            "ffprobe": ffprobe_ver,
            "libsoxr": soxr_label,
            "opus encoder": "libopus",
            "flac encoder": "flac",
        },
    )
