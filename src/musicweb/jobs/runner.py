"""Single-flight library job runner: scan and regen kinds share one worker."""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from sqlalchemy.orm import Session

from musicweb.artist_images import ArtistImageFetcher
from musicweb.config import Settings
from musicweb.cover import CoverStore
from musicweb.db.engine import Database
from musicweb.db.fts import fts_rebuild
from musicweb.db.models import ScanState
from musicweb.images import WebpAssetStore
from musicweb.library import Library
from musicweb.lyrics import LyricsFetcher
from musicweb.scan.artist_images import fetch_artist_images
from musicweb.scan.batch import ScanMode
from musicweb.scan.covers import album_cover_sources, extract_covers
from musicweb.scan.finalize import mark_missing, recount_entities
from musicweb.scan.index_phase import run_index
from musicweb.scan.lyrics import fetch_track_lyrics
from musicweb.timeutil import utc_now_iso

logger = logging.getLogger(__name__)

JobKind = Literal[
    "scan",
    "regen-covers",
    "regen-artist-images",
    "regen-lyrics",
]


@dataclass
class PhaseCtx:
    kind: JobKind
    mode: ScanMode
    force: bool
    seen_count: int = 0
    upserted: int = 0
    missing: int = 0
    seen_paths: set[str] = field(default_factory=set)
    cover_queue: dict[str, Path] = field(default_factory=dict)


class LibraryJobRunner:
    """Single-worker library jobs (thread or same-thread) with ScanState progress."""

    def __init__(
        self,
        database: Database,
        library: Library,
        cover_store: CoverStore,
        artist_image_store: WebpAssetStore,
        settings: Settings,
    ) -> None:
        self._db = database
        self._library = library
        self._covers = cover_store
        self._artist_images = artist_image_store
        self._artist_fetcher = ArtistImageFetcher(
            artist_image_store, library, settings
        )
        self._lyrics_fetcher = LyricsFetcher(settings)
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._cancel = threading.Event()
        self._running = False
        self._job_kind: JobKind = "scan"

    @property
    def is_running(self) -> bool:
        with self._lock:
            return self._running

    def status(self) -> dict:
        with self._db.session() as session:
            row = session.get(ScanState, 1)
            if row is None:
                return {"status": "idle", "kind": "scan"}
            return {
                "status": row.status,
                "kind": row.kind or "scan",
                "mode": row.mode,
                "force": row.force,
                "started_at": row.started_at,
                "finished_at": row.finished_at,
                "phase": row.phase,
                "files_seen": row.files_seen,
                "files_upserted": row.files_upserted,
                "files_missing": row.files_missing,
                "files_total_hint": row.files_total_hint,
                "current_path": row.current_path,
                "last_error": row.last_error,
            }

    def start(
        self,
        kind: JobKind = "scan",
        *,
        mode: ScanMode = "quick",
        force: bool = False,
    ) -> bool:
        """Start a job on a background thread if idle. Returns False if busy."""
        with self._lock:
            if self._running:
                return False
            self._cancel.clear()
            self._running = True
            self._begin(kind, mode=mode, force=force)
            self._thread = threading.Thread(
                target=self._thread_main,
                args=(kind,),
                kwargs={"mode": mode, "force": force},
                name="library-job",
                daemon=True,
            )
            self._thread.start()
            return True

    def run_sync(
        self,
        kind: JobKind = "scan",
        *,
        mode: ScanMode = "quick",
        force: bool = False,
    ) -> None:
        """Run a job on the caller thread (CLI). Cooperative cancel on KeyboardInterrupt."""
        with self._lock:
            if self._running:
                raise RuntimeError("Library job already running")
            self._cancel.clear()
            self._running = True
            self._begin(kind, mode=mode, force=force)
        try:
            try:
                self._execute(kind, mode=mode, force=force)
            except KeyboardInterrupt:
                self._cancel.set()
                with self._db.session() as session:
                    self._set_state(
                        session,
                        status="idle",
                        finished_at=utc_now_iso(),
                        phase=None,
                        current_path=None,
                        last_error="Canceled by operator",
                    )
                raise
        finally:
            with self._lock:
                self._running = False
                self._thread = None

    def request_cancel(self) -> bool:
        with self._lock:
            if not self._running:
                return False
            self._cancel.set()
            with self._db.session() as session:
                row = session.get(ScanState, 1)
                if row and row.status == "running":
                    row.status = "canceling"
                    session.commit()
            return True

    def shutdown(self) -> None:
        self.request_cancel()
        thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=30)

    def _thread_main(
        self,
        kind: JobKind,
        *,
        mode: ScanMode = "quick",
        force: bool = False,
    ) -> None:
        try:
            self._execute(kind, mode=mode, force=force)
        finally:
            with self._lock:
                self._running = False
                self._thread = None

    def _set_state(self, session: Session, **fields: object) -> None:
        row = session.get(ScanState, 1)
        if row is None:
            row = ScanState(id=1, status="idle", kind="scan")
            session.add(row)
        for key, value in fields.items():
            setattr(row, key, value)
        session.commit()

    def _begin(
        self,
        kind: JobKind,
        *,
        mode: ScanMode = "quick",
        force: bool = False,
    ) -> None:
        self._job_kind = kind
        with self._db.session() as session:
            self._set_state(
                session,
                status="running",
                kind=kind,
                mode=mode if kind == "scan" else None,
                force=force if kind != "scan" else (mode == "full"),
                started_at=utc_now_iso(),
                finished_at=None,
                phase=None,
                files_seen=0,
                files_upserted=0,
                files_missing=0,
                files_total_hint=None,
                current_path=None,
                last_error=None,
            )

    def _progress(
        self,
        *,
        mode: ScanMode | str | None,
        phase: str | None,
        files_seen: int,
        files_upserted: int,
        files_missing: int = 0,
        files_total_hint: int | None = None,
        current_path: str | None = None,
    ) -> None:
        status = "canceling" if self._cancel.is_set() else "running"
        kind = self._job_kind
        parts: list[str] = [f"Library {kind}: {status}"]
        if mode:
            parts[0] += f" ({mode})"
        if phase:
            parts.append(phase)
        if files_total_hint and files_total_hint > 0:
            pct = min(100, max(0, round(files_seen * 100 / files_total_hint)))
            parts.append(f"{pct}% ({files_seen}/{files_total_hint})")
        else:
            parts.append(f"seen {files_seen}")
        parts.append(f"updated {files_upserted}")
        parts.append(f"missing {files_missing}")
        if current_path:
            parts.append(f"path {current_path}")
        logger.info(" · ".join(parts))

    def _log_final_summary(self, *, kind: JobKind, canceled: bool) -> None:
        st = self.status()
        verb = "canceled" if canceled else "finished"
        if kind == "scan":
            logger.info(
                "Library scan %s (mode=%s) · seen %s · updated %s · missing %s",
                verb,
                st.get("mode"),
                st.get("files_seen") or 0,
                st.get("files_upserted") or 0,
                st.get("files_missing") or 0,
            )
        else:
            logger.info(
                "Library job %s · kind=%s · force=%s",
                verb,
                kind,
                st.get("force"),
            )

    def _execute(
        self,
        kind: JobKind,
        *,
        mode: ScanMode = "quick",
        force: bool = False,
    ) -> None:
        label = kind if kind != "scan" else f"scan({mode})"
        logger.info("Library job started (%s)", label)
        try:
            self._run_phases(kind, mode=mode, force=force)
            finished = utc_now_iso()
            idle: dict[str, object] = {
                "status": "idle",
                "finished_at": finished,
                "phase": None,
                "current_path": None,
            }
            if kind == "scan":
                idle["last_scan_finished_at"] = finished
            with self._db.session() as session:
                self._set_state(session, **idle)
            self._log_final_summary(kind=kind, canceled=self._cancel.is_set())
        except Exception as exc:
            logger.exception("Library job failed (%s)", kind)
            with self._db.session() as session:
                self._set_state(
                    session,
                    status="failed",
                    finished_at=utc_now_iso(),
                    phase=None,
                    current_path=None,
                    last_error=str(exc)[:2000],
                )

    PHASES: dict[JobKind, tuple[str, ...]] = {
        "scan": ("index", "finalize", "covers", "artist_images", "lyrics"),
        "regen-covers": ("covers",),
        "regen-artist-images": ("artist_images",),
        "regen-lyrics": ("lyrics",),
    }

    def _begin_phase(self, ctx: PhaseCtx, name: str) -> None:
        with self._db.session() as session:
            self._set_state(session, phase=name, force=ctx.force)
        if ctx.kind == "scan":
            self._progress(
                mode=ctx.mode,
                phase=name,
                files_seen=ctx.seen_count,
                files_upserted=ctx.upserted,
                files_missing=ctx.missing,
            )

    def _run_phases(
        self,
        kind: JobKind,
        *,
        mode: ScanMode,
        force: bool,
    ) -> None:
        names = self.PHASES.get(kind)
        if names is None:
            raise ValueError(f"Unknown job kind: {kind}")
        ctx = PhaseCtx(
            kind=kind,
            mode=mode,
            force=force if kind != "scan" else mode == "full",
        )
        for name in names:
            if self._cancel.is_set():
                return
            self._begin_phase(ctx, name)
            getattr(self, f"_do_{name}")(ctx)

    def _do_index(self, ctx: PhaseCtx) -> None:
        result = run_index(
            self._db,
            self._library,
            ctx.mode,
            cancel=self._cancel.is_set,
            on_progress=lambda **kwargs: self._progress(
                mode=ctx.mode, phase="index", **kwargs
            ),
        )
        ctx.seen_count = result.seen_count
        ctx.upserted = result.upserted
        ctx.seen_paths = result.seen_paths
        ctx.cover_queue = result.cover_queue

    def _do_finalize(self, ctx: PhaseCtx) -> None:
        ctx.missing = self._phase_finalize(
            ctx.mode,
            seen_count=ctx.seen_count,
            upserted=ctx.upserted,
            seen_paths=ctx.seen_paths,
        )

    def _do_covers(self, ctx: PhaseCtx) -> None:
        with self._db.session() as session:
            if ctx.kind != "scan":
                ctx.cover_queue = album_cover_sources(session, self._library)
            if not ctx.cover_queue:
                return
            extract_covers(
                session,
                self._covers,
                ctx.cover_queue,
                force=ctx.force,
                cancel=self._cancel.is_set,
            )

    def _do_artist_images(self, ctx: PhaseCtx) -> None:
        fetch_artist_images(
            self._db,
            self._artist_fetcher,
            cancel=self._cancel.is_set,
            force=ctx.force,
        )

    def _do_lyrics(self, ctx: PhaseCtx) -> None:
        fetch_track_lyrics(
            self._db,
            self._lyrics_fetcher,
            self._library,
            cancel=self._cancel.is_set,
            force=ctx.force,
        )

    def _phase_finalize(
        self,
        mode: ScanMode,
        *,
        seen_count: int,
        upserted: int,
        seen_paths: set[str],
    ) -> int:
        with self._db.session() as session:
            missing = mark_missing(session, seen_paths)
            recount_entities(session)
            if mode == "full":
                fts_rebuild(session)
            session.commit()
            self._set_state(
                session,
                files_seen=seen_count,
                files_upserted=upserted,
                files_missing=missing,
            )
        self._progress(
            mode=mode,
            phase="finalize",
            files_seen=seen_count,
            files_upserted=upserted,
            files_missing=missing,
        )
        return missing
