"""On-demand multi-codec streaming via ffmpeg (Opus + FLAC).

Profiles:
  - opus_192_48000 → Opus VBR 192 kbps @ 48 kHz (libopus) — default
  - opus_160_48000 → Opus VBR 160 kbps @ 48 kHz (libopus)
  - flac_16_44100  → FLAC 16-bit @ 44.1 kHz (ffmpeg default compression)
  - flac_16_48000  → FLAC 16-bit @ 48 kHz (ffmpeg default compression)
  - flac_24_96000  → FLAC 24-bit @ 96 kHz (ffmpeg default compression)

High-quality rate/bit-depth conversion uses libsoxr through aresample at
SoX "very high quality" equivalents (``rate -v -L``):
  - precision=28 ≈ SoX ``rate -v``
  - linear phase ≈ SoX ``-L`` (libsoxr default; not exposed in ffmpeg)
  - cutoff=0.95 (SoX VHQ ~95% bandwidth; ffmpeg soxr default is ~0.91)
  - dither_method=shibata ≈ SoX ``dither -s`` **only when reducing bit depth**
    (source bits > profile bits). Never dither when increasing bit depth
    (e.g. 16→24). Perfect rate+depth match skips aresample entirely.

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

# SoX rate -v -L via libsoxr. Shibata dither only when reducing bit depth.
ARESAMPLE_HQ = (
    "aresample=resampler=soxr:precision=28:cutoff=0.95:dither_method=shibata"
)
ARESAMPLE_HQ_NO_DITHER = (
    "aresample=resampler=soxr:precision=28:cutoff=0.95"
)

DEFAULT_PROFILE_TAG = "opus_192_48000"


@dataclass(frozen=True)
class SourceAudioTech:
    """Source file audio parameters (from DB scan or encode-time probe)."""

    sample_rate_hz: int | None
    bit_depth: int | None
    channels: int | None = None
    source_codec: str | None = None

# MIME strings for HTMLMediaElement.canPlayType() on the client.
_CAN_PLAY_OPUS = 'audio/ogg; codecs="opus"'
_CAN_PLAY_FLAC = "audio/flac"


@dataclass(frozen=True)
class StreamProfile:
    """Product stream profile (format intent)."""

    tag: str
    sample_rate: int
    bitrate_kbps: int  # unused (0) for lossless FLAC
    extension: str
    media_type: str
    kind: str  # "opus" | "flac"
    label: str  # short UI label
    bit_depth: int  # 16 or 24 (PCM width fed to the encoder)
    can_play: str  # MIME probe string for browser capability checks


PROFILES: dict[str, StreamProfile] = {
    p.tag: p
    for p in [
        StreamProfile(
            tag="opus_192_48000",
            sample_rate=48000,
            bitrate_kbps=192,
            extension="opus",
            media_type="audio/ogg",
            kind="opus",
            label="Opus 192k 48kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_OPUS,
        ),
        StreamProfile(
            tag="opus_160_48000",
            sample_rate=48000,
            bitrate_kbps=160,
            extension="opus",
            media_type="audio/ogg",
            kind="opus",
            label="Opus 160k 48kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_OPUS,
        ),
        StreamProfile(
            tag="flac_16_44100",
            sample_rate=44100,
            bitrate_kbps=0,
            extension="flac",
            media_type="audio/flac",
            kind="flac",
            label="FLAC 44.1kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_FLAC,
        ),
        StreamProfile(
            tag="flac_16_48000",
            sample_rate=48000,
            bitrate_kbps=0,
            extension="flac",
            media_type="audio/flac",
            kind="flac",
            label="FLAC 48kHz",
            bit_depth=16,
            can_play=_CAN_PLAY_FLAC,
        ),
        StreamProfile(
            tag="flac_24_96000",
            sample_rate=96000,
            bitrate_kbps=0,
            extension="flac",
            media_type="audio/flac",
            kind="flac",
            label="FLAC 24-bit 96kHz",
            bit_depth=24,
            can_play=_CAN_PLAY_FLAC,
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
        # Job queue: all guarded by _queue_cond
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

    @staticmethod
    def _sample_fmt(profile: StreamProfile) -> str:
        """PCM sample format for the profile's encoder + bit depth."""
        if profile.kind == "flac":
            # FLAC: s16 or s32 (+ bits_per_raw_sample for true 24-bit).
            return "s32" if profile.bit_depth >= 24 else "s16"
        # Lossy codecs (Opus): 16-bit intermediate is standard.
        return "s16"

    @staticmethod
    def _aresample_filter(
        profile: StreamProfile,
        source_tech: SourceAudioTech | None,
    ) -> str | None:
        """Return aresample filter string, or None to skip aresample.

        Policy:
          - Perfect rate+depth match → no filter
          - Source bits > profile bits → soxr + Shibata dither
          - Unknown bits → 16-bit target → dither (conservative)
          - Else (rate change, same/up depth, unknown→24) → soxr without dither
        """
        src_rate = source_tech.sample_rate_hz if source_tech else None
        src_bits = source_tech.bit_depth if source_tech else None
        tgt_rate = profile.sample_rate
        tgt_bits = profile.bit_depth

        if (
            src_rate is not None
            and src_bits is not None
            and src_rate == tgt_rate
            and src_bits == tgt_bits
        ):
            return None

        if src_bits is not None and src_bits > tgt_bits:
            return ARESAMPLE_HQ

        if src_bits is None and tgt_bits <= 16:
            return ARESAMPLE_HQ

        return ARESAMPLE_HQ_NO_DITHER

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
        af = self._aresample_filter(profile, source_tech)
        if af is not None:
            cmd.extend(["-af", af])
        cmd.extend(
            [
                "-sample_fmt",
                self._sample_fmt(profile),
                "-ar",
                str(profile.sample_rate),
                "-vn",
            ]
        )

        if profile.kind == "opus":
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
            # Leave compression at ffmpeg default; set true 24-bit when needed.
            cmd.extend(["-c:a", "flac"])
            if profile.bit_depth >= 24:
                cmd.extend(["-bits_per_raw_sample", "24"])
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

    def _encoder_label(self, profile: StreamProfile) -> str:
        """Human label for the encoder a profile encodes with."""
        if profile.kind == "opus":
            return "libopus"
        return "flac"

    def _run_job(self, job: _Job) -> None:
        """Encode one job into a .partial, atomic rename on success."""
        profile = job.profile
        out_path = self._out_path(job.key, profile)
        tech = job.source_tech
        if tech is None or tech.sample_rate_hz is None or tech.bit_depth is None:
            tech = probe_source_audio_tech(job.source, known=tech)
            job.source_tech = tech
        af = self._aresample_filter(profile, tech)
        dither = af is not None and "dither_method" in af
        logger.info(
            "Transcode %s → profile=%s encoder=%s ar=%s bit=%s "
            "src=%s/%s resample=%s dither=%s%s",
            job.relative_path,
            profile.tag,
            self._encoder_label(profile),
            profile.sample_rate,
            profile.bit_depth,
            tech.bit_depth if tech else None,
            tech.sample_rate_hz if tech else None,
            "no" if af is None else "soxr",
            "yes" if dither else "no",
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


def probe_source_audio_tech(
    path: Path,
    *,
    known: SourceAudioTech | None = None,
) -> SourceAudioTech:
    """Fill missing rate/bits via mutagen (and optional ffprobe fallback)."""
    rate = known.sample_rate_hz if known else None
    bits = known.bit_depth if known else None
    channels = known.channels if known else None
    codec = known.source_codec if known else None

    if rate is not None and bits is not None:
        return SourceAudioTech(rate, bits, channels, codec)

    try:
        from musicweb.metadata import read_metadata

        meta = read_metadata(path)
        if rate is None:
            rate = meta.get("sample_rate_hz")
        if bits is None:
            bits = meta.get("bit_depth")
        if channels is None:
            channels = meta.get("channels")
        if codec is None:
            codec = meta.get("source_codec")
    except Exception as exc:
        logger.debug("mutagen tech probe failed for %s: %s", path, exc)

    if rate is None or bits is None:
        try:
            proc = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "a:0",
                    "-show_entries",
                    "stream=sample_rate,bits_per_raw_sample,bits_per_sample,channels,codec_name",
                    "-of",
                    "default=noprint_wrappers=1",
                    str(path),
                ],
                capture_output=True,
                timeout=15,
                check=False,
            )
            text = (proc.stdout or b"").decode("utf-8", errors="replace")
            vals: dict[str, str] = {}
            for line in text.splitlines():
                if "=" in line:
                    k, v = line.split("=", 1)
                    vals[k.strip()] = v.strip()
            if rate is None and vals.get("sample_rate"):
                rate = int(vals["sample_rate"])
            if bits is None:
                raw = vals.get("bits_per_raw_sample") or vals.get("bits_per_sample")
                if raw and raw not in ("N/A", "0"):
                    bits = int(raw)
            if channels is None and vals.get("channels"):
                channels = int(vals["channels"])
            if codec is None and vals.get("codec_name"):
                codec = vals["codec_name"]
        except Exception as exc:
            logger.debug("ffprobe tech probe failed for %s: %s", path, exc)

    return SourceAudioTech(rate, bits, channels, codec)


def tech_from_track(track: object) -> SourceAudioTech:
    """Build SourceAudioTech from a Track ORM row (duck-typed attributes)."""
    return SourceAudioTech(
        sample_rate_hz=getattr(track, "sample_rate_hz", None),
        bit_depth=getattr(track, "bit_depth", None),
        channels=getattr(track, "channels", None),
        source_codec=getattr(track, "source_codec", None),
    )


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
    Ensure ffmpeg has libsoxr, libopus, and flac.

    Raises RuntimeError on any missing requirement (fail fast).
    """
    ffmpeg_ver = _require_tool(
        "ffmpeg",
        ["-version"],
        hint="Install ffmpeg with libsoxr, libopus, and flac.",
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
            "libsoxr": soxr_label,
            "opus encoder": "libopus",
            "flac encoder": "flac",
        },
    )
