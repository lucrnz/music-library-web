"""On-demand multi-codec streaming via ffmpeg (Opus + FLAC).

Owns queue, preemption, subprocess lifecycle, and ``.partial`` atomic rename.
Encode argv fragments and aresample/dither *policy* live in ``profiles``
(``StreamProfile``, ``plan_aresample``).

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
import shutil
import subprocess
import threading
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

from musicweb.transcode.probe import SourceAudioTech, probe_source_audio_tech
from musicweb.transcode.profiles import (
    DEFAULT_PROFILE_TAG,
    StreamProfile,
    get_profile,
    plan_aresample,
)

logger = logging.getLogger(__name__)


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
    source_tech: SourceAudioTech | None = None
    done: threading.Event = field(default_factory=threading.Event)
    error: Exception | None = None
    out_path: Path | None = None
    proc: subprocess.Popen | None = None
    cancel_requested: bool = False
    purged: bool = False  # set by clear_cache(): never re-queue this job


class Transcoder:
    """Transcode library audio into tagged cache files (Opus or FLAC).

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
        # Job queues: all guarded by _queue_cond
        self._queue_cond = threading.Condition()
        self._urgent: deque[_Job] = deque()
        self._prewarm: deque[_Job] = deque()
        self._jobs: dict[str, _Job] = {}
        self._current: _Job | None = None
        self._worker: threading.Thread | None = None

    @property
    def temp_dir(self) -> Path:
        if self._temp_dir is None:
            raise RuntimeError("Transcoder not started")
        return self._temp_dir

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
        canceled job raises TranscodeCanceled instead of a generic error
        (SIGTERM makes the exit code non-zero).
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
            tool = cmd[0] if cmd else "encoder"
            raise RuntimeError(
                f"{tool} not found on PATH (needed for {label})."
            ) from exc

        job.proc = proc
        _, stderr = proc.communicate()
        job.proc = None

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
        source_tech: SourceAudioTech | None = None,
    ) -> list[str]:
        """Build a single-pass ffmpeg command: conditional soxr + encode."""
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
        ]
        plan = plan_aresample(profile, source_tech)
        if plan.filter is not None:
            cmd.extend(["-af", plan.filter])
        cmd.extend(
            [
                "-sample_fmt",
                profile.sample_fmt(),
                "-ar",
                str(profile.sample_rate),
                "-vn",
                *profile.ffmpeg_codec_args(),
                "-f",
                profile.ffmpeg_container_format(),
                str(dest_partial),
            ]
        )
        return cmd

    def prepare(
        self,
        source: Path,
        relative_path: str,
        *,
        profile_tag: str = DEFAULT_PROFILE_TAG,
        source_tech: SourceAudioTech | None = None,
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
                source_tech=source_tech,
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
        source_tech: SourceAudioTech | None = None,
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
                    source_tech=source_tech,
                )
                self._jobs[key] = job
                self._urgent.appendleft(job)
            else:
                job.urgent = True
                if source_tech is not None and job.source_tech is None:
                    job.source_tech = source_tech
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
        """Ask a running encode process to stop; the worker loop cleans up."""
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

    def _run_job(self, job: _Job) -> None:
        """Encode one job into a .partial, atomic rename on success."""
        profile = job.profile
        out_path = self._out_path(job.key, profile)
        tech = job.source_tech
        if tech is None or tech.sample_rate_hz is None or tech.bit_depth is None:
            tech = probe_source_audio_tech(job.source, known=tech)
            job.source_tech = tech
        plan = plan_aresample(profile, tech)
        logger.info(
            "Transcode %s → profile=%s encoder=%s ar=%s bit=%s "
            "src=%s/%s resample=%s dither=%s%s",
            job.relative_path,
            profile.tag,
            profile.encoder_label(),
            profile.sample_rate,
            profile.bit_depth,
            tech.bit_depth if tech else None,
            tech.sample_rate_hz if tech else None,
            "no" if plan.filter is None else "soxr",
            "yes" if plan.dither else "no",
            " (urgent)" if job.urgent else "",
        )

        partial = self.temp_dir / f"{out_path.name}.partial"
        try:
            if partial.exists():
                partial.unlink(missing_ok=True)
            cmd = self._encode_cmd(
                job.source, partial, profile, source_tech=tech
            )
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
