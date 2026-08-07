"""On-demand multi-codec streaming via a single ffmpeg encode.

Profiles:
  - aac_256_44100  → AAC-LC @ 44.1 kHz (aac_at preferred, else libfdk_aac)
  - opus_192_48000 → Opus VBR 192 kbps @ 48 kHz (libopus)
  - opus_160_48000 → Opus VBR 160 kbps @ 48 kHz (libopus)
  - flac_16_44100  → FLAC 16-bit @ 44.1 kHz (ffmpeg default compression)
  - flac_16_48000  → FLAC 16-bit @ 48 kHz (ffmpeg default compression)

High-quality rate/bit-depth conversion uses libsoxr through aresample
(precision=28 ≈ SoX rate -v, Shibata dither ≈ dither -s). When the input
sample rate already matches the target, ffmpeg skips the rate-conversion
step automatically.

Cache files live under the process cache ``streams/`` subdirectory and are
wiped with the process root on shutdown (or via scoped ``/api/cache/clear``).

All encodes run on a single background worker fed by a two-tier priority
queue: play requests (urgent, newest first) ahead of playlist prewarm
requests (FIFO). A play request promotes its queued job or preempts a
running prewarm encode (canceled cleanly — the .partial is deleted, never
renamed — and re-queued to restart afterwards).
"""

from __future__ import annotations

import hashlib
import logging
import re
import shutil
import subprocess
import threading
from collections import deque
from dataclasses import dataclass, field
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
    bitrate_kbps: int  # unused (0) for lossless FLAC
    extension: str
    media_type: str
    kind: str  # "aac" | "opus" | "flac"
    label: str  # short UI label


PROFILES: dict[str, StreamProfile] = {
    p.tag: p
    for p in [
        StreamProfile(
            tag="aac_256_44100",
            sample_rate=44100,
            bitrate_kbps=256,
            extension="m4a",
            media_type="audio/mp4",
            kind="aac",
            label="AAC 256k 44.1kHz",
        ),
        StreamProfile(
            tag="opus_192_48000",
            sample_rate=48000,
            bitrate_kbps=192,
            extension="opus",
            media_type="audio/ogg",
            kind="opus",
            label="Opus 192k 48kHz",
        ),
        StreamProfile(
            tag="opus_160_48000",
            sample_rate=48000,
            bitrate_kbps=160,
            extension="opus",
            media_type="audio/ogg",
            kind="opus",
            label="Opus 160k 48kHz",
        ),
        StreamProfile(
            tag="flac_16_44100",
            sample_rate=44100,
            bitrate_kbps=0,
            extension="flac",
            media_type="audio/flac",
            kind="flac",
            label="FLAC 44.1kHz",
        ),
        StreamProfile(
            tag="flac_16_48000",
            sample_rate=48000,
            bitrate_kbps=0,
            extension="flac",
            media_type="audio/flac",
            kind="flac",
            label="FLAC 48kHz",
        ),
    ]
}


def get_profile(tag: str) -> StreamProfile:
    profile = PROFILES.get(tag)
    if profile is None:
        raise ValueError(
            f"Unsupported codec profile {tag!r}; "
            f"allowed: {sorted(PROFILES)}"
        )
    return profile


class TranscodeCanceled(Exception):
    """Internal: a running encode was preempted by an urgent request."""


@dataclass
class _Job:
    """One encode request (play or prewarm), tracked until completion."""

    key: str
    source: Path
    relative_path: str
    profile: StreamProfile
    urgent: bool
    done: threading.Event = field(default_factory=threading.Event)
    error: Exception | None = None
    out_path: Path | None = None
    proc: subprocess.Popen | None = None
    cancel_requested: bool = False
    purged: bool = False  # set by clear_cache(): never re-queue this job


class Transcoder:
    """Transcode library audio into tagged cache files (AAC, Opus, or FLAC).

    All encodes flow through a single background worker with two priority
    tiers: urgent (play requests, newest first) and prewarm (FIFO). A play
    request for a queued job promotes it to the urgent tier; a play request
    for any other track preempts a running *prewarm* encode, which is then
    re-queued to restart after the urgent work drains. Encodes write a
    ``.partial`` file that is atomically renamed only on success, so a
    canceled encode never leaves a servable corrupt file behind.
    """

    MAX_PENDING_PREWARM = 300

    def __init__(self) -> None:
        self._temp_dir: Path | None = None
        self._closed = False
        # Job queue: all guarded by _queue_cond
        self._queue_cond = threading.Condition()
        self._urgent: deque[_Job] = deque()
        self._prewarm: deque[_Job] = deque()
        self._jobs: dict[str, _Job] = {}
        self._current: _Job | None = None
        self._worker: threading.Thread | None = None
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

    def start(self, cache_dir: Path) -> Path:
        """Use an existing streams/ directory and start the encode worker."""
        if self._temp_dir is not None:
            return self._temp_dir
        cache_dir.mkdir(parents=True, exist_ok=True)
        self._temp_dir = cache_dir
        self._closed = False
        self._worker = threading.Thread(
            target=self._worker_loop, name="transcode-worker", daemon=True
        )
        self._worker.start()
        logger.info("Stream cache directory: %s", self._temp_dir)
        return self._temp_dir

    def shutdown(self) -> None:
        """Fail pending jobs and kill in-flight processes.

        Disk is owned by ProcessCache (wiped on its shutdown).
        """
        self._closed = True
        with self._queue_cond:
            self._drain_queues(
                RuntimeError("Transcoder is shut down"),
                self._urgent,
                self._prewarm,
            )
            if self._current is not None:
                # Sets cancel_requested and terminates the job's process.
                self._request_cancel(self._current)
            self._queue_cond.notify_all()

        if self._worker is not None:
            self._worker.join(timeout=5)
            self._worker = None

        self._temp_dir = None

    def _drain_queues(self, error: Exception, *queues: deque[_Job]) -> int:
        """Fail every job in the given queues. Call with _queue_cond held."""
        drained = 0
        for queue in queues:
            while queue:
                job = queue.popleft()
                self._jobs.pop(job.key, None)
                job.error = error
                job.done.set()
                drained += 1
        return drained

    def _cache_key(self, relative_path: str, profile_tag: str) -> str:
        payload = f"{relative_path}\0{profile_tag}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def _out_path(self, key: str, profile: StreamProfile) -> Path:
        return self.temp_dir / f"{key}.{profile.tag}.{profile.extension}"

    @staticmethod
    def _cached(out_path: Path) -> bool:
        return out_path.is_file() and out_path.stat().st_size > 0

    def _run_tracked(
        self,
        key: str,
        cmd: list[str],
        *,
        label: str,
        job: _Job,
    ) -> None:
        """Run a subprocess, exposing the handle on the job; raise on failure.

        The process handle is stored on the job so it can be preempted; a
        canceled job raises TranscodeCanceled instead of a generic ffmpeg
        error (SIGTERM makes the exit code non-zero).
        """
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

        job.proc = proc
        _, stderr = proc.communicate()

        if job.cancel_requested:
            raise TranscodeCanceled(f"{label} preempted for {key}")
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
            fmt = "mp4"
        elif profile.kind == "opus":
            cmd.extend(
                [
                    "-c:a",
                    "libopus",
                    "-b:a",
                    f"{profile.bitrate_kbps}k",
                    "-vbr",
                    "on",
                ]
            )
            fmt = "opus"
        elif profile.kind == "flac":
            # 16-bit + sample rate set above; leave compression at ffmpeg default
            cmd.extend(["-c:a", "flac"])
            fmt = "flac"
        else:
            raise ValueError(f"Unknown profile kind: {profile.kind}")

        cmd.extend(["-f", fmt, str(dest_partial)])
        return cmd

    def prepare(
        self,
        source: Path,
        relative_path: str,
        *,
        profile_tag: str = DEFAULT_PROFILE_TAG,
    ) -> str:
        """
        Queue a background (prewarm) encode; never blocks on ffmpeg.

        Returns "ready" (cached), "already" (queued or running),
        "queued" (newly enqueued), or "skipped" (pending-prewarm cap hit).
        """
        if self._closed or self._temp_dir is None:
            raise RuntimeError("Transcoder is shut down")
        profile = get_profile(profile_tag)
        key = self._cache_key(relative_path, profile.tag)
        if self._cached(self._out_path(key, profile)):
            return "ready"

        with self._queue_cond:
            if self._closed:
                raise RuntimeError("Transcoder is shut down")
            if key in self._jobs:
                return "already"
            if len(self._prewarm) >= self.MAX_PENDING_PREWARM:
                return "skipped"
            job = _Job(
                key=key,
                source=source,
                relative_path=relative_path,
                profile=profile,
                urgent=False,
            )
            self._jobs[key] = job
            self._prewarm.append(job)
            self._queue_cond.notify()
            return "queued"

    def drop_pending_prewarm(self) -> int:
        """Drop all pending prewarm jobs (e.g. codec changed). Returns count."""
        with self._queue_cond:
            dropped = self._drain_queues(
                RuntimeError("Prewarm request dropped"), self._prewarm
            )
        if dropped:
            logger.info("Dropped %d pending prewarm job(s)", dropped)
        return dropped

    def clear_cache(self) -> int:
        """Drop every queued job, cancel any running encode, and wipe the
        cache directory contents. Returns the number of entries removed."""
        if self._temp_dir is None:
            raise RuntimeError("Transcoder is shut down")

        with self._queue_cond:
            self._drain_queues(
                RuntimeError("Cache cleared"), self._urgent, self._prewarm
            )
            current = self._current
            if current is not None:
                # Cancel and mark purged so the worker fails it instead of
                # re-queueing it at the head of the prewarm tier.
                current.purged = True
                self._request_cancel(current)
            while self._current is not None:
                self._queue_cond.wait(timeout=5)

        removed = 0
        for child in self.temp_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                try:
                    child.unlink()
                except OSError:
                    continue
            removed += 1
        logger.info(
            "Cleared stream cache: %s (%d entries)", self.temp_dir, removed
        )
        return removed

    def ensure_stream(
        self,
        source: Path,
        relative_path: str,
        *,
        profile_tag: str = DEFAULT_PROFILE_TAG,
    ) -> Path:
        """
        Return path to a cached stream file, encoding if needed.

        Blocks until the encode finishes. A queued prewarm job for this
        track+profile is promoted to the urgent tier; a running prewarm
        encode of anything else is preempted (canceled cleanly, then
        re-queued) so playback starts as soon as possible.
        """
        if self._closed or self._temp_dir is None:
            raise RuntimeError("Transcoder is shut down")
        if not source.is_file():
            raise FileNotFoundError(f"Source not found: {source}")

        profile = get_profile(profile_tag)
        key = self._cache_key(relative_path, profile.tag)
        out_path = self._out_path(key, profile)
        if self._cached(out_path):
            return out_path

        with self._queue_cond:
            if self._closed:
                raise RuntimeError("Transcoder is shut down")
            job = self._jobs.get(key)
            if job is None:
                job = _Job(
                    key=key,
                    source=source,
                    relative_path=relative_path,
                    profile=profile,
                    urgent=True,
                )
                self._jobs[key] = job
                self._urgent.appendleft(job)
            else:
                job.urgent = True
                try:
                    self._prewarm.remove(job)
                except ValueError:
                    pass  # already running or already urgent
                else:
                    self._urgent.appendleft(job)

            current = self._current
            if current is not None and current is not job and not current.urgent:
                self._request_cancel(current)
            self._queue_cond.notify_all()

        job.done.wait()
        if job.error is not None:
            raise job.error
        if job.out_path is None:  # defensive; done without error implies output
            raise RuntimeError(f"Transcode finished without output for {source.name}")
        return job.out_path

    def _request_cancel(self, job: _Job) -> None:
        """Ask a running job's ffmpeg to stop; the worker loop cleans up."""
        job.cancel_requested = True
        proc = job.proc
        if proc is not None and proc.poll() is None:
            logger.info(
                "Preempting prewarm transcode of %s (pid=%s)",
                job.relative_path,
                proc.pid,
            )
            proc.terminate()

    def _worker_loop(self) -> None:
        """Single consumer: urgent tier (newest first), then prewarm (FIFO)."""
        while True:
            with self._queue_cond:
                while (
                    not self._closed and not self._urgent and not self._prewarm
                ):
                    self._queue_cond.wait()
                if self._closed:
                    return
                if self._urgent:
                    job = self._urgent.popleft()
                else:
                    job = self._prewarm.popleft()
                self._current = job

            try:
                self._run_job(job)
            except TranscodeCanceled:
                with self._queue_cond:
                    self._current = None
                    self._jobs.pop(job.key, None)
                    if self._closed:
                        job.error = RuntimeError("Transcoder is shut down")
                        job.done.set()
                    elif job.purged:
                        # Cache was cleared: fail the job, never re-queue it.
                        job.error = RuntimeError("Cache cleared")
                        job.done.set()
                    else:
                        # Re-arm and restart at the head of the prewarm tier
                        # once urgent work drains (ffmpeg restarts the file).
                        job.cancel_requested = False
                        job.proc = None
                        job.urgent = False
                        self._jobs[job.key] = job
                        self._prewarm.appendleft(job)
                    self._queue_cond.notify_all()
            except Exception as exc:
                logger.warning(
                    "Transcode failed for %s (%s): %s",
                    job.relative_path,
                    job.profile.tag,
                    exc,
                )
                with self._queue_cond:
                    self._current = None
                    self._jobs.pop(job.key, None)
                    self._queue_cond.notify_all()
                job.error = exc
                job.done.set()
            else:
                with self._queue_cond:
                    self._current = None
                    self._jobs.pop(job.key, None)
                    self._queue_cond.notify_all()
                job.done.set()

    def _encoder_label(self, profile: StreamProfile) -> str:
        """Human label for the encoder a profile encodes with."""
        if profile.kind == "aac":
            return self.aac_encoder
        if profile.kind == "opus":
            return "libopus"
        return "flac"

    def _run_job(self, job: _Job) -> None:
        """Encode one job: ffmpeg into a .partial, atomic rename on success."""
        profile = job.profile
        out_path = self._out_path(job.key, profile)
        logger.info(
            "Transcode %s → profile=%s encoder=%s ar=%s%s",
            job.relative_path,
            profile.tag,
            self._encoder_label(profile),
            profile.sample_rate,
            " (urgent)" if job.urgent else "",
        )

        partial = self.temp_dir / f"{out_path.name}.partial"
        try:
            if partial.exists():
                partial.unlink(missing_ok=True)
            cmd = self._encode_cmd(job.source, partial, profile)
            self._run_tracked(
                job.key, cmd, label=f"ffmpeg-{profile.tag}", job=job
            )
            if not partial.is_file() or partial.stat().st_size == 0:
                partial.unlink(missing_ok=True)
                raise RuntimeError(
                    f"ffmpeg produced empty output for {job.source.name} "
                    f"({profile.tag})"
                )
            partial.replace(out_path)
            job.out_path = out_path
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
            "libopus, flac, and aac_at or libfdk_aac."
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


@dataclass(frozen=True)
class DependencyReport:
    """Startup dependency check results: banner labels + resolved encoders."""

    tools: dict[str, str]
    aac_encoder: str


def check_dependencies() -> DependencyReport:
    """
    Ensure ffmpeg has libsoxr, a usable AAC encoder, libopus, and flac.

    Returns banner labels per dependency plus the resolved AAC encoder name.
    Raises RuntimeError on any missing requirement (fail fast).
    """
    ffmpeg_ver = _require_tool(
        "ffmpeg",
        ["-version"],
        hint=(
            "Install ffmpeg with libsoxr, libopus, flac, "
            "and aac_at or libfdk_aac."
        ),
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
    aac_name, aac_label = resolve_aac_encoder(encoders)

    logger.info("AAC encoder selected: %s", aac_label)
    logger.info("Opus encoder: libopus")
    logger.info("FLAC encoder: flac")
    logger.info("Resampler: %s", soxr_label)

    return DependencyReport(
        tools={
            "ffmpeg": ffmpeg_ver,
            "libsoxr": soxr_label,
            "aac encoder": aac_label,
            "opus encoder": "libopus",
            "flac encoder": "flac",
        },
        aac_encoder=aac_name,
    )
