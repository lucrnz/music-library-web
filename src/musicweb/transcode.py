"""On-demand dual-codec streaming via a single ffmpeg encode.

Profiles:
  - aac_256_44100  → AAC-LC @ 44.1 kHz (aac_at preferred, else libfdk_aac)
  - opus_192_48000 → Opus VBR 192 kbps @ 48 kHz (libopus)

High-quality rate/bit-depth conversion uses libsoxr through aresample
(precision=28 ≈ SoX rate -v, Shibata dither ≈ dither -s). When the input
sample rate already matches the target, ffmpeg skips the rate-conversion
step automatically.

Cache files live under a process temp dir and are wiped on shutdown.
"""

from __future__ import annotations

import hashlib
import logging
import re
import shutil
import subprocess
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# SoX rate -v / dither -s equivalent via libsoxr
ARESAMPLE_HQ = (
    "aresample=resampler=soxr:precision=28:cutoff=0.95:dither_method=shibata"
)

DEFAULT_PROFILE_TAG = "aac_256_44100"


@dataclass(frozen=True)
class StreamProfile:
    """Product stream profile (format intent; AAC binary chosen at runtime)."""

    tag: str
    sample_rate: int
    bitrate_kbps: int
    extension: str
    media_type: str
    kind: str  # "aac" | "opus"


PROFILES: dict[str, StreamProfile] = {
    "aac_256_44100": StreamProfile(
        tag="aac_256_44100",
        sample_rate=44100,
        bitrate_kbps=256,
        extension="m4a",
        media_type="audio/mp4",
        kind="aac",
    ),
    "opus_192_48000": StreamProfile(
        tag="opus_192_48000",
        sample_rate=48000,
        bitrate_kbps=192,
        extension="opus",
        media_type="audio/ogg",
        kind="opus",
    ),
}


def get_profile(tag: str) -> StreamProfile:
    profile = PROFILES.get(tag)
    if profile is None:
        raise ValueError(
            f"Unsupported codec profile {tag!r}; "
            f"allowed: {sorted(PROFILES)}"
        )
    return profile


class Transcoder:
    """Transcode library audio into tagged cache files (AAC or Opus)."""

    def __init__(self) -> None:
        self._temp_dir: Path | None = None
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()
        self._active: dict[str, subprocess.Popen] = {}
        self._active_guard = threading.Lock()
        self._closed = False
        # Set by configure_encoders() after dependency check
        self._aac_encoder: str | None = None

    @property
    def temp_dir(self) -> Path:
        if self._temp_dir is None:
            raise RuntimeError("Transcoder not started")
        return self._temp_dir

    @property
    def aac_encoder(self) -> str:
        if self._aac_encoder is None:
            raise RuntimeError("AAC encoder not configured")
        return self._aac_encoder

    def configure_encoders(self, aac_encoder: str) -> None:
        """Record the AAC encoder resolved at startup (aac_at or libfdk_aac)."""
        if aac_encoder not in ("aac_at", "libfdk_aac"):
            raise ValueError(f"Unsupported AAC encoder: {aac_encoder}")
        self._aac_encoder = aac_encoder

    def start(self) -> Path:
        if self._temp_dir is not None:
            return self._temp_dir
        self._temp_dir = Path(tempfile.mkdtemp(prefix="musicweb-"))
        self._closed = False
        logger.info("Transcode cache directory: %s", self._temp_dir)
        return self._temp_dir

    def shutdown(self) -> None:
        """Kill in-flight helper processes and remove the entire temp directory."""
        self._closed = True
        with self._active_guard:
            procs = list(self._active.items())
            self._active.clear()
        for key, proc in procs:
            if proc.poll() is None:
                logger.info("Terminating process for %s (pid=%s)", key, proc.pid)
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=2)

        if self._temp_dir is not None and self._temp_dir.exists():
            logger.info("Cleaning up transcode cache: %s", self._temp_dir)
            shutil.rmtree(self._temp_dir, ignore_errors=True)
            self._temp_dir = None

    def _cache_key(self, relative_path: str, profile_tag: str) -> str:
        payload = f"{relative_path}\0{profile_tag}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def _lock_for(self, key: str) -> threading.Lock:
        with self._locks_guard:
            if key not in self._locks:
                self._locks[key] = threading.Lock()
            return self._locks[key]

    def _run_tracked(
        self,
        key: str,
        cmd: list[str],
        *,
        label: str,
    ) -> None:
        """Run a subprocess, tracking it for clean shutdown; raise on failure."""
        if self._closed:
            raise RuntimeError("Transcoder is shut down")

        logger.debug("Running %s: %s", label, " ".join(cmd))
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"{cmd[0]} not found on PATH (needed for {label})."
            ) from exc

        track_key = f"{key}:{label}"
        with self._active_guard:
            self._active[track_key] = proc

        try:
            _, stderr = proc.communicate()
        finally:
            with self._active_guard:
                self._active.pop(track_key, None)

        if self._closed:
            raise RuntimeError("Transcoder is shut down")

        if proc.returncode != 0:
            err = (stderr or b"").decode("utf-8", errors="replace").strip()
            raise RuntimeError(f"{label} failed: {err or proc.returncode}")

    def _encode_cmd(
        self,
        source: Path,
        dest_partial: Path,
        profile: StreamProfile,
    ) -> list[str]:
        """Build a single-pass ffmpeg command: libsoxr aresample + encode."""
        cmd: list[str] = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:a:0",
            "-af",
            ARESAMPLE_HQ,
            "-sample_fmt",
            "s16",
            "-ar",
            str(profile.sample_rate),
            "-vn",
        ]

        if profile.kind == "aac":
            encoder = self.aac_encoder
            cmd.extend(["-c:a", encoder])
            if encoder == "aac_at":
                cmd.extend(
                    [
                        "-aac_at_mode",
                        "vbr",
                        "-b:a",
                        f"{profile.bitrate_kbps}k",
                    ]
                )
            else:
                # libfdk_aac: VBR mode 5 ≈ highest quality (near-transparent)
                cmd.extend(
                    [
                        "-vbr",
                        "5",
                        "-afterburner",
                        "1",
                    ]
                )
            cmd.extend(["-f", "mp4", str(dest_partial)])
        elif profile.kind == "opus":
            cmd.extend(
                [
                    "-c:a",
                    "libopus",
                    "-b:a",
                    f"{profile.bitrate_kbps}k",
                    "-vbr",
                    "on",
                    "-f",
                    "opus",
                    str(dest_partial),
                ]
            )
        else:
            raise ValueError(f"Unknown profile kind: {profile.kind}")

        return cmd

    def ensure_stream(
        self,
        source: Path,
        relative_path: str,
        *,
        profile_tag: str = DEFAULT_PROFILE_TAG,
    ) -> Path:
        """
        Return path to a cached stream file, encoding if needed.

        Cache keys and filenames include the profile tag so AAC and Opus
        variants of the same track never collide.
        """
        if self._closed or self._temp_dir is None:
            raise RuntimeError("Transcoder is shut down")
        if not source.is_file():
            raise FileNotFoundError(f"Source not found: {source}")

        profile = get_profile(profile_tag)
        key = self._cache_key(relative_path, profile.tag)
        out_name = f"{key}.{profile.tag}.{profile.extension}"
        out_path = self.temp_dir / out_name
        if out_path.is_file() and out_path.stat().st_size > 0:
            return out_path

        lock = self._lock_for(key)
        with lock:
            if self._closed:
                raise RuntimeError("Transcoder is shut down")
            if out_path.is_file() and out_path.stat().st_size > 0:
                return out_path

            encoder_label = (
                self.aac_encoder if profile.kind == "aac" else "libopus"
            )
            logger.info(
                "Transcode %s → profile=%s encoder=%s ar=%s",
                relative_path,
                profile.tag,
                encoder_label,
                profile.sample_rate,
            )

            partial = self.temp_dir / f"{out_name}.partial"
            try:
                if partial.exists():
                    partial.unlink(missing_ok=True)
                cmd = self._encode_cmd(source, partial, profile)
                self._run_tracked(key, cmd, label=f"ffmpeg-{profile.tag}")
                if not partial.is_file() or partial.stat().st_size == 0:
                    partial.unlink(missing_ok=True)
                    raise RuntimeError(
                        f"ffmpeg produced empty output for {source.name} "
                        f"({profile.tag})"
                    )
                partial.replace(out_path)
                return out_path
            except Exception:
                partial.unlink(missing_ok=True)
                raise


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
            "libopus, and aac_at or libfdk_aac."
        ) from exc
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"ffmpeg -encoders failed: {err or proc.returncode}")

    text = (proc.stdout or b"").decode("utf-8", errors="replace")
    # Lines look like: " A....D libfdk_aac           Fraunhofer FDK AAC ..."
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


def resolve_aac_encoder(encoders: set[str] | None = None) -> tuple[str, str]:
    """
    Prefer Apple AudioToolbox (aac_at), else Fraunhofer FDK (libfdk_aac).

    Returns (encoder_name, human_label).
    """
    if encoders is None:
        encoders = _ffmpeg_encoder_names()
    if "aac_at" in encoders:
        return "aac_at", "aac_at (Apple AudioToolbox)"
    if "libfdk_aac" in encoders:
        return "libfdk_aac", "libfdk_aac (Fraunhofer FDK)"
    raise RuntimeError(
        "No suitable AAC encoder found. Need aac_at (macOS AudioToolbox) "
        "or libfdk_aac (ffmpeg built with --enable-libfdk-aac --enable-nonfree)."
    )


def check_dependencies() -> dict[str, str]:
    """
    Ensure ffmpeg has libsoxr, a usable AAC encoder, and libopus.

    Returns a short label per dependency for the startup banner.
    Raises RuntimeError on any missing requirement (fail fast).
    """
    ffmpeg_ver = _require_tool(
        "ffmpeg",
        ["-version"],
        hint=(
            "Install ffmpeg with libsoxr, libopus, and aac_at or libfdk_aac."
        ),
    )
    soxr_label = _require_libsoxr()
    encoders = _ffmpeg_encoder_names()
    if "libopus" not in encoders:
        raise RuntimeError(
            "ffmpeg is missing the libopus encoder. "
            "Install/rebuild ffmpeg with --enable-libopus."
        )
    aac_name, aac_label = resolve_aac_encoder(encoders)

    logger.info("AAC encoder selected: %s", aac_label)
    logger.info("Opus encoder: libopus")
    logger.info("Resampler: %s", soxr_label)

    return {
        "ffmpeg": ffmpeg_ver,
        "libsoxr": soxr_label,
        "aac encoder": aac_label,
        "opus encoder": "libopus",
        "_aac_encoder_name": aac_name,  # consumed by lifespan; not for display
    }


def check_ffmpeg() -> None:
    """Back-compat alias."""
    check_dependencies()
