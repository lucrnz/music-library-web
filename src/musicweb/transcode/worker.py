"""On-demand multi-codec streaming via ffmpeg (Opus + FLAC).

Owns queue, preemption, subprocess lifecycle, and ``.partial`` atomic rename.
Encode argv fragments and aresample/dither *policy* live in ``profiles``
(``StreamProfile``, ``plan_aresample``).

Cache files live under the process cache ``streams/`` subdirectory and are
wiped with the process root on shutdown, or by idle eviction
(``Transcoder.clear_cache`` after about an hour with no HTTP client).
Queue edits may drop individual paths via ``forget_paths``.

All encodes run on a single background worker fed by four priority
classes: play requests (urgent, newest first), then radio next-2,
download prewarm, and playlist prewarm (each FIFO). A higher class
promotes its queued job or preempts a running lower-class encode
(canceled cleanly — the .partial is deleted, never renamed — and
re-queued on its own class to restart afterwards).
"""

from __future__ import annotations

import hashlib
import logging
import shutil
import subprocess
import threading
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

from musicweb.runtime.spawn import popen
from musicweb.transcode.probe import SourceAudioTech, probe_source_audio_tech
from musicweb.transcode.profiles import (
    DEFAULT_PROFILE_TAG,
    PROFILES,
    StreamProfile,
    get_profile,
    plan_aresample,
)

logger = logging.getLogger(__name__)

PREWARM_CLASSES = ("radio", "download", "playlist")
PREWARM_RANK = {"radio": 2, "download": 1, "playlist": 0}


class TranscodeCanceled(Exception):
    """Internal: a running encode was preempted by a higher-class request."""


def job_log_label(job: _Job) -> str:
    """Path for on-demand jobs; radio uses ``log_label`` (never a path)."""
    return job.log_label or job.relative_path


@dataclass
class _Job:
    """One encode request (play or prewarm), tracked until completion."""

    key: str
    source: Path
    relative_path: str
    profile: StreamProfile
    urgent: bool
    source_tech: SourceAudioTech | None = None
    log_label: str | None = None
    prewarm_class: str = "playlist"
    done: threading.Event = field(default_factory=threading.Event)
    error: Exception | None = None
    out_path: Path | None = None
    proc: subprocess.Popen | None = None
    cancel_requested: bool = False
    purged: bool = False  # set by clear_cache/forget_paths: never re-queue


class Transcoder:
    """Transcode library audio into tagged cache files (Opus or FLAC).

    All encodes flow through a single background worker with four priority
    classes: urgent (play requests, newest first), radio next-2, download
    prewarm, and playlist prewarm (each FIFO). A higher-class request for a
    queued job promotes it; a higher-class request for any other track
    preempts a running lower-class encode, which is then re-queued on its
    own class after higher work drains. Encodes write a ``.partial`` file
    that is atomically renamed only on success, so a canceled encode never
    leaves a servable corrupt file behind.
    """

    MAX_PENDING_PREWARM = 300

    def __init__(self) -> None:
        self._temp_dir: Path | None = None
        self._closed = False
        # Job queues: all guarded by _queue_cond
        self._queue_cond = threading.Condition()
        self._urgent: deque[_Job] = deque()
        self._radio: deque[_Job] = deque()
        self._download: deque[_Job] = deque()
        self._playlist: deque[_Job] = deque()
        self._jobs: dict[str, _Job] = {}
        self._current: _Job | None = None
        self._worker: threading.Thread | None = None

    def _prewarm_deques(self) -> tuple[deque[_Job], deque[_Job], deque[_Job]]:
        return self._radio, self._download, self._playlist

    def _deque_for(self, prewarm_class: str) -> deque[_Job]:
        if prewarm_class == "radio":
            return self._radio
        if prewarm_class == "download":
            return self._download
        if prewarm_class == "playlist":
            return self._playlist
        raise ValueError(f"Unknown prewarm class: {prewarm_class}")

    def _any_prewarm(self) -> bool:
        return bool(self._radio or self._download or self._playlist)

    def _pop_next_prewarm(self) -> _Job:
        if self._radio:
            return self._radio.popleft()
        if self._download:
            return self._download.popleft()
        return self._playlist.popleft()

    def _remove_from_prewarm(self, job: _Job) -> bool:
        """Remove *job* from whichever prewarm deque holds it. Holds lock."""
        for queue in self._prewarm_deques():
            try:
                queue.remove(job)
                return True
            except ValueError:
                continue
        return False

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
                *self._prewarm_deques(),
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

    def _drain_matching(
        self, error: Exception, paths: set[str], *queues: deque[_Job]
    ) -> int:
        """Fail queued jobs whose relative_path is in *paths*. Holds lock."""
        drained = 0
        for queue in queues:
            keep = [job for job in queue if job.relative_path not in paths]
            drop = [job for job in queue if job.relative_path in paths]
            queue.clear()
            queue.extend(keep)
            for job in drop:
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
            proc = popen(
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

    def _enqueue_encode(
        self,
        source: Path,
        relative_path: str,
        *,
        profile_tag: str = DEFAULT_PROFILE_TAG,
        source_tech: SourceAudioTech | None = None,
        urgent: bool = False,
        log_label: str | None = None,
        tier: str = "playlist",
    ) -> tuple[str, _Job | None]:
        """
        Queue encode work (or promote an existing job). Never waits on ffmpeg.

        Returns ``(status, job)``:
        - ``"ready"``: cache hit; job is None
        - ``"already"``: job was already queued or running (promoted if needed)
        - ``"queued"``: newly enqueued
        - ``"skipped"``: non-urgent only; pending-prewarm cap hit; job is None

        Caller must not hold ``_queue_cond``.
        """
        if self._closed or self._temp_dir is None:
            raise RuntimeError("Transcoder is shut down")
        if not urgent and tier not in PREWARM_RANK:
            raise ValueError(f"Unknown prewarm class: {tier}")
        profile = get_profile(profile_tag)
        key = self._cache_key(relative_path, profile.tag)
        if self._cached(self._out_path(key, profile)):
            return "ready", None

        with self._queue_cond:
            if self._closed:
                raise RuntimeError("Transcoder is shut down")

            job = self._jobs.get(key)
            if job is not None:
                if log_label and job.log_label is None:
                    job.log_label = log_label
                if urgent:
                    self._promote_to_urgent(job, source_tech)
                else:
                    self._promote_prewarm_class(job, tier, source_tech)
                return "already", job

            if urgent:
                job = _Job(
                    key=key,
                    source=source,
                    relative_path=relative_path,
                    profile=profile,
                    urgent=True,
                    source_tech=source_tech,
                    log_label=log_label,
                    prewarm_class=tier if tier in PREWARM_RANK else "playlist",
                )
                self._jobs[key] = job
                self._urgent.appendleft(job)
                self._preempt_if_outranked(job)
                self._queue_cond.notify_all()
                return "queued", job

            target = self._deque_for(tier)
            if len(target) >= self.MAX_PENDING_PREWARM:
                return "skipped", None
            job = _Job(
                key=key,
                source=source,
                relative_path=relative_path,
                profile=profile,
                urgent=False,
                source_tech=source_tech,
                log_label=log_label,
                prewarm_class=tier,
            )
            self._jobs[key] = job
            target.append(job)
            self._preempt_if_outranked(job)
            self._queue_cond.notify_all()
            return "queued", job

    def _promote_to_urgent(
        self, job: _Job, source_tech: SourceAudioTech | None
    ) -> None:
        """Mark *job* urgent; move from a prewarm deque if pending. Holds lock."""
        job.urgent = True
        if source_tech is not None and job.source_tech is None:
            job.source_tech = source_tech
        if self._remove_from_prewarm(job):
            self._urgent.appendleft(job)
        self._preempt_if_outranked(job)
        self._queue_cond.notify_all()

    def _promote_prewarm_class(
        self,
        job: _Job,
        tier: str,
        source_tech: SourceAudioTech | None,
    ) -> None:
        """Raise *job* to *tier* if higher; never demote. Holds lock."""
        if source_tech is not None and job.source_tech is None:
            job.source_tech = source_tech
        if job.urgent:
            return
        new_rank = PREWARM_RANK[tier]
        if new_rank <= PREWARM_RANK[job.prewarm_class]:
            return
        pending = self._remove_from_prewarm(job)
        job.prewarm_class = tier
        if pending:
            self._deque_for(tier).append(job)
        self._preempt_if_outranked(job)
        self._queue_cond.notify_all()

    def _preempt_if_outranked(self, job: _Job) -> None:
        """Cancel a running lower-class encode of a different key. Holds lock."""
        current = self._current
        if current is None or current is job:
            return
        if job.urgent:
            if not current.urgent:
                self._request_cancel(current)
            return
        if current.urgent:
            return
        if PREWARM_RANK[job.prewarm_class] > PREWARM_RANK[current.prewarm_class]:
            self._request_cancel(current)

    def prepare(
        self,
        source: Path,
        relative_path: str,
        *,
        profile_tag: str = DEFAULT_PROFILE_TAG,
        source_tech: SourceAudioTech | None = None,
        urgent: bool = False,
        log_label: str | None = None,
        tier: str = "playlist",
    ) -> str:
        """
        Queue a background encode; never blocks on ffmpeg.

        Non-urgent jobs go on the matching prewarm FIFO (subject to that
        deque's pending cap). Urgent jobs go on the urgent tier (newest
        first), can promote an existing job, and may preempt a running
        lower-class encode of another key — same priority model as play,
        without waiting for completion.

        Returns "ready" (cached), "already" (queued or running),
        "queued" (newly enqueued), or "skipped" (pending-prewarm cap hit).
        """
        status, _job = self._enqueue_encode(
            source,
            relative_path,
            profile_tag=profile_tag,
            source_tech=source_tech,
            urgent=urgent,
            log_label=log_label,
            tier=tier,
        )
        return status

    def drop_pending_prewarm(self) -> int:
        """Drop pending playlist-prewarm jobs (e.g. codec changed). Returns count."""
        with self._queue_cond:
            dropped = self._drain_queues(
                RuntimeError("Prewarm request dropped"), self._playlist
            )
        if dropped:
            logger.info("Dropped %d pending prewarm job(s)", dropped)
        return dropped

    def forget_paths(self, relative_paths: Iterable[str]) -> int:
        """Drop jobs and cache files for the given library paths (all profiles).

        Returns the number of files removed. Does not wipe the cache tree.
        """
        if self._temp_dir is None:
            raise RuntimeError("Transcoder is shut down")
        paths = {p for p in relative_paths if p}
        if not paths:
            return 0

        with self._queue_cond:
            self._drain_matching(
                RuntimeError("Stream forgotten"),
                paths,
                self._urgent,
                *self._prewarm_deques(),
            )
            current = self._current
            if current is not None and current.relative_path in paths:
                current.purged = True
                self._request_cancel(current)
                while self._current is not None:
                    self._queue_cond.wait(timeout=5)

        removed = 0
        for rel in paths:
            for profile in PROFILES.values():
                out_path = self._out_path(
                    self._cache_key(rel, profile.tag), profile
                )
                partial = self.temp_dir / f"{out_path.name}.partial"
                for child in (out_path, partial):
                    try:
                        child.unlink()
                    except FileNotFoundError:
                        continue
                    except OSError:
                        continue
                    removed += 1
        logger.info("Forgot %d stream cache file(s)", removed)
        return removed

    def clear_cache(self) -> int:
        """Drop every queued job, cancel any running encode, and wipe the
        cache directory contents. Returns the number of entries removed."""
        if self._temp_dir is None:
            raise RuntimeError("Transcoder is shut down")

        with self._queue_cond:
            self._drain_queues(
                RuntimeError("Cache cleared"),
                self._urgent,
                *self._prewarm_deques(),
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
        out_path = self._out_path(
            self._cache_key(relative_path, profile.tag), profile
        )
        status, job = self._enqueue_encode(
            source,
            relative_path,
            profile_tag=profile_tag,
            source_tech=source_tech,
            urgent=True,
        )
        if status == "ready":
            return out_path
        if job is None:
            raise RuntimeError(f"Urgent enqueue failed for {source.name}")

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
                job_log_label(job),
                proc.pid,
            )
            proc.terminate()

    def _requeue_canceled(self, job: _Job) -> None:
        """Re-arm a preempted job on its own class, or fail it. Holds lock."""
        self._current = None
        self._jobs.pop(job.key, None)
        if self._closed:
            job.error = RuntimeError("Transcoder is shut down")
            job.done.set()
        elif job.purged:
            job.error = RuntimeError("Cache cleared")
            job.done.set()
        else:
            job.cancel_requested = False
            job.proc = None
            job.urgent = False
            self._jobs[job.key] = job
            self._deque_for(job.prewarm_class).appendleft(job)

    def _worker_loop(self) -> None:
        """Single consumer: urgent, then radio, download, playlist."""
        while True:
            with self._queue_cond:
                while (
                    not self._closed
                    and not self._urgent
                    and not self._any_prewarm()
                ):
                    self._queue_cond.wait()
                if self._closed:
                    return
                if self._urgent:
                    job = self._urgent.popleft()
                else:
                    job = self._pop_next_prewarm()
                self._current = job

            try:
                self._run_job(job)
            except TranscodeCanceled:
                with self._queue_cond:
                    self._requeue_canceled(job)
                    self._queue_cond.notify_all()
            except Exception as exc:
                logger.warning(
                    "Transcode failed for %s (%s): %s",
                    job_log_label(job),
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
            job_log_label(job),
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
