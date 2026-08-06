"""On-demand Opus transcoding with optional high-quality sox resample.

Pipeline:
  1. Probe with ffprobe (sample rate + bit depth).
  2. If already 16-bit / 44.1 kHz → ffmpeg → Opus directly.
  3. Otherwise → (optional ffmpeg decode for non-sox formats) →
     sox HQ resample to 16-bit/44.1 → ffmpeg → Opus.

Temp intermediates live under the process cache dir and are cleaned on shutdown.
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import subprocess
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

TARGET_RATE = 44100
TARGET_BITS = 16

# Formats SoX can typically open without a prior decode step
SOX_NATIVE_SUFFIXES = {
    ".flac",
    ".wav",
    ".aiff",
    ".aif",
    ".aifc",
    ".ogg",
    ".opus",
    ".mp3",
    ".caf",
    ".raw",
    ".w64",
}


@dataclass(frozen=True)
class AudioProbe:
    sample_rate: int | None
    bit_depth: int | None
    sample_fmt: str | None
    codec_name: str | None

    def needs_hq_resample(self) -> bool:
        """True unless the stream is already 16-bit PCM at 44.1 kHz."""
        if self.sample_rate is None or self.bit_depth is None:
            # Unknown properties: be safe and run the HQ path
            return True
        return self.sample_rate != TARGET_RATE or self.bit_depth != TARGET_BITS


def probe_audio(path: Path) -> AudioProbe:
    """Read first audio stream sample rate and bit depth via ffprobe."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=sample_rate,bits_per_raw_sample,bits_per_sample,sample_fmt,codec_name",
        "-of",
        "json",
        str(path),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=30, check=False)
    except FileNotFoundError as exc:
        raise RuntimeError(
            "ffprobe not found on PATH. Install ffmpeg (includes ffprobe)."
        ) from exc

    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"ffprobe failed for {path.name}: {err or proc.returncode}")

    try:
        data = json.loads(proc.stdout.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"ffprobe returned invalid JSON for {path.name}") from exc

    streams = data.get("streams") or []
    if not streams:
        raise RuntimeError(f"No audio stream found in {path.name}")

    stream = streams[0]
    sample_fmt = stream.get("sample_fmt")
    codec_name = stream.get("codec_name")

    rate_raw = stream.get("sample_rate")
    sample_rate: int | None
    try:
        sample_rate = int(rate_raw) if rate_raw not in (None, "N/A", "") else None
    except (TypeError, ValueError):
        sample_rate = None

    bit_depth = _infer_bit_depth(stream)
    return AudioProbe(
        sample_rate=sample_rate,
        bit_depth=bit_depth,
        sample_fmt=str(sample_fmt) if sample_fmt else None,
        codec_name=str(codec_name) if codec_name else None,
    )


def _infer_bit_depth(stream: dict) -> int | None:
    for key in ("bits_per_raw_sample", "bits_per_sample"):
        raw = stream.get(key)
        if raw in (None, "", "N/A", 0, "0"):
            continue
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value

    fmt = (stream.get("sample_fmt") or "").lower()
    # Planar variants: s16p, s32p, fltp, …
    base = fmt.rstrip("p")
    if base in ("s16", "u16"):
        return 16
    if base in ("s24", "u24"):
        return 24
    if base in ("s32", "u32"):
        return 32
    if base in ("s8", "u8"):
        return 8
    if base in ("flt", "fltp", "dbl", "dblp"):
        # Floating-point masters need dither/bit-depth reduction
        return 32
    return None


class Transcoder:
    """Transcode lossless audio to Opus VBR 192 kbps into a temp cache directory."""

    def __init__(self) -> None:
        self._temp_dir: Path | None = None
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()
        self._active: dict[str, subprocess.Popen] = {}
        self._active_guard = threading.Lock()
        self._closed = False

    @property
    def temp_dir(self) -> Path:
        if self._temp_dir is None:
            raise RuntimeError("Transcoder not started")
        return self._temp_dir

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

    def _cache_key(self, relative_path: str) -> str:
        return hashlib.sha256(relative_path.encode("utf-8")).hexdigest()

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

    def _decode_to_flac(self, source: Path, dest: Path, key: str) -> None:
        """Lossless decode/re-wrap to FLAC so SoX can open the material."""
        if dest.exists():
            dest.unlink(missing_ok=True)
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:a:0",
            "-c:a",
            "flac",
            "-vn",
            str(dest),
        ]
        self._run_tracked(key, cmd, label="ffmpeg-decode")
        if not dest.is_file() or dest.stat().st_size == 0:
            dest.unlink(missing_ok=True)
            raise RuntimeError(f"ffmpeg decode produced empty output for {source.name}")

    def _sox_resample(self, source: Path, dest: Path, key: str) -> None:
        """
        High-quality resample/dither to 16-bit 44.1 kHz FLAC:

            sox input -b 16 -r 44100 output.flac rate -v -L dither -s
        """
        if dest.exists():
            dest.unlink(missing_ok=True)
        cmd = [
            "sox",
            str(source),
            "-b",
            str(TARGET_BITS),
            "-r",
            str(TARGET_RATE),
            str(dest),
            "rate",
            "-v",
            "-L",
            "dither",
            "-s",
        ]
        self._run_tracked(key, cmd, label="sox-resample")
        if not dest.is_file() or dest.stat().st_size == 0:
            dest.unlink(missing_ok=True)
            raise RuntimeError(f"sox produced empty output for {source.name}")

    def _ffmpeg_to_opus(self, source: Path, dest_partial: Path, key: str) -> None:
        if dest_partial.exists():
            dest_partial.unlink(missing_ok=True)
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:a:0",
            "-c:a",
            "libopus",
            "-b:a",
            "192k",
            "-vbr",
            "on",
            "-vn",
            # Explicit format: .partial is not a recognized extension
            "-f",
            "opus",
            str(dest_partial),
        ]
        self._run_tracked(key, cmd, label="ffmpeg-opus")
        if not dest_partial.is_file() or dest_partial.stat().st_size == 0:
            dest_partial.unlink(missing_ok=True)
            raise RuntimeError(f"ffmpeg opus encode produced empty output for {source.name}")

    def ensure_opus(self, source: Path, relative_path: str) -> Path:
        """
        Return path to cached Opus file, transcoding if needed.

        Uses a single-flight lock per relative path so concurrent clients
        do not spawn multiple helper processes for the same track.
        """
        if self._closed or self._temp_dir is None:
            raise RuntimeError("Transcoder is shut down")
        if not source.is_file():
            raise FileNotFoundError(f"Source not found: {source}")

        key = self._cache_key(relative_path)
        out_path = self.temp_dir / f"{key}.opus"
        if out_path.is_file() and out_path.stat().st_size > 0:
            return out_path

        lock = self._lock_for(key)
        with lock:
            if self._closed:
                raise RuntimeError("Transcoder is shut down")
            if out_path.is_file() and out_path.stat().st_size > 0:
                return out_path

            probe = probe_audio(source)
            needs_resample = probe.needs_hq_resample()
            logger.info(
                "Transcode %s: rate=%s bits=%s fmt=%s codec=%s → resample=%s",
                relative_path,
                probe.sample_rate,
                probe.bit_depth,
                probe.sample_fmt,
                probe.codec_name,
                needs_resample,
            )

            partial = self.temp_dir / f"{key}.opus.partial"
            decoded: Path | None = None
            resampled: Path | None = None
            opus_source = source

            try:
                if needs_resample:
                    sox_input = source
                    if source.suffix.lower() not in SOX_NATIVE_SUFFIXES:
                        decoded = self.temp_dir / f"{key}.decode.flac"
                        logger.info(
                            "Decoding %s for SoX (format %s)",
                            relative_path,
                            source.suffix,
                        )
                        self._decode_to_flac(source, decoded, key)
                        sox_input = decoded

                    resampled = self.temp_dir / f"{key}.44k16.flac"
                    logger.info(
                        "SoX HQ resample → 16-bit/44.1 kHz: %s",
                        relative_path,
                    )
                    self._sox_resample(sox_input, resampled, key)
                    opus_source = resampled

                self._ffmpeg_to_opus(opus_source, partial, key)
                partial.replace(out_path)
                return out_path
            except Exception:
                partial.unlink(missing_ok=True)
                raise
            finally:
                # Intermediate FLAC only needed during this encode; Opus is the cache.
                if decoded is not None:
                    decoded.unlink(missing_ok=True)
                if resampled is not None:
                    resampled.unlink(missing_ok=True)


def _require_tool(name: str, args: list[str], *, hint: str) -> str:
    """Run a version-style check; return first stdout line for logging."""
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
        raise RuntimeError(f"{name} is installed but failed to run: {err or proc.returncode}")
    out = (proc.stdout or b"").decode("utf-8", errors="replace").strip()
    # sox prints version on stderr
    if not out:
        out = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
    first = out.splitlines()[0] if out else name
    return first


def check_dependencies() -> dict[str, str]:
    """
    Ensure sox, ffmpeg, and ffprobe are available.

    Returns a short version string per tool for the startup banner.
    """
    versions = {
        "ffmpeg": _require_tool(
            "ffmpeg",
            ["-version"],
            hint="Install ffmpeg with libopus support.",
        ),
        "ffprobe": _require_tool(
            "ffprobe",
            ["-version"],
            hint="Install ffmpeg (includes ffprobe).",
        ),
        "sox": _require_tool(
            "sox",
            ["--version"],
            hint="Install SoX for high-quality resampling (e.g. brew install sox).",
        ),
    }
    return versions


# Back-compat alias used by older imports
def check_ffmpeg() -> None:
    check_dependencies()
