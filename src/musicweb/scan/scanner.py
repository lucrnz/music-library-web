"""Background library scanner with quick/full modes and cancel support."""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Literal

from sqlalchemy.orm import Session

from musicweb.artist_image import ArtistImageStore
from musicweb.artist_images import ArtistImageFetcher
from musicweb.config import Settings
from musicweb.cover import CoverStore
from musicweb.db.engine import Database
from musicweb.db.fts import fts_rebuild
from musicweb.db.models import ScanState
from musicweb.library import Library
from musicweb.scan.artist_images import fetch_artist_images
from musicweb.scan.batch import process_batch
from musicweb.scan.covers import extract_covers
from musicweb.scan.finalize import mark_missing, recount_entities
from musicweb.scan.walk import iter_lossless_audio
from musicweb.timeutil import utc_now_iso

logger = logging.getLogger(__name__)

ScanMode = Literal["quick", "full"]
BATCH_SIZE = 100


class LibraryScanner:
    """Single-worker background scanner (thread + ScanState + phase sequence)."""

    def __init__(
        self,
        database: Database,
        library: Library,
        cover_store: CoverStore,
        artist_image_store: ArtistImageStore,
        settings: Settings,
    ) -> None:
        self._db = database
        self._library = library
        self._covers = cover_store
        self._artist_images = artist_image_store
        self._artist_fetcher = ArtistImageFetcher(
            artist_image_store, library, settings
        )
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._cancel = threading.Event()
        self._running = False

    @property
    def is_running(self) -> bool:
        with self._lock:
            return self._running

    def status(self) -> dict:
        with self._db.session() as session:
            row = session.get(ScanState, 1)
            if row is None:
                return {"status": "idle"}
            return {
                "status": row.status,
                "mode": row.mode,
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

    def start(self, mode: ScanMode = "quick") -> bool:
        """Start a scan if idle. Returns False if already running."""
        with self._lock:
            if self._running:
                return False
            self._cancel.clear()
            self._running = True
            self._thread = threading.Thread(
                target=self._run,
                args=(mode,),
                name="library-scanner",
                daemon=True,
            )
            self._thread.start()
            return True

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

    def _set_state(self, session: Session, **fields: object) -> None:
        row = session.get(ScanState, 1)
        if row is None:
            row = ScanState(id=1, status="idle")
            session.add(row)
        for key, value in fields.items():
            setattr(row, key, value)
        session.commit()

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
        persist: bool = True,
        **extra_state: object,
    ) -> None:
        """Optionally persist ScanState fields and always log progress."""
        if persist:
            with self._db.session() as session:
                self._set_state(
                    session,
                    phase=phase,
                    files_seen=files_seen,
                    files_upserted=files_upserted,
                    files_missing=files_missing,
                    files_total_hint=files_total_hint,
                    current_path=current_path,
                    **extra_state,
                )
        status = "canceling" if self._cancel.is_set() else "running"
        parts: list[str] = [f"Library scan: {status}"]
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

    def _log_final_summary(self, *, canceled: bool) -> None:
        st = self.status()
        mode = st.get("mode")
        seen = st.get("files_seen") or 0
        upserted = st.get("files_upserted") or 0
        missing = st.get("files_missing") or 0
        verb = "canceled" if canceled else "finished"
        logger.info(
            "Library scan %s (mode=%s) · seen %s · updated %s · missing %s",
            verb,
            mode,
            seen,
            upserted,
            missing,
        )

    def _run(self, mode: ScanMode) -> None:
        logger.info("Library scan started (mode=%s)", mode)
        try:
            with self._db.session() as session:
                self._set_state(
                    session,
                    status="running",
                    mode=mode,
                    started_at=utc_now_iso(),
                    finished_at=None,
                    phase="index",
                    files_seen=0,
                    files_upserted=0,
                    files_missing=0,
                    files_total_hint=None,
                    current_path=None,
                    last_error=None,
                )
            self._progress(
                mode=mode,
                phase="index",
                files_seen=0,
                files_upserted=0,
                persist=False,
            )
            self._scan(mode)
            with self._db.session() as session:
                self._set_state(
                    session,
                    status="idle",
                    finished_at=utc_now_iso(),
                    phase=None,
                    current_path=None,
                )
            self._log_final_summary(canceled=self._cancel.is_set())
        except Exception as exc:
            logger.exception("Library scan failed")
            with self._db.session() as session:
                self._set_state(
                    session,
                    status="failed",
                    finished_at=utc_now_iso(),
                    phase=None,
                    current_path=None,
                    last_error=str(exc)[:2000],
                )
        finally:
            with self._lock:
                self._running = False
                self._thread = None

    def _scan(self, mode: ScanMode) -> None:
        """Single-pass index, then finalize → covers → artist images."""
        seen_count, upserted, seen_paths, cover_queue = self._phase_index(mode)
        if self._cancel.is_set():
            return

        missing = self._phase_finalize(
            mode, seen_count=seen_count, upserted=upserted, seen_paths=seen_paths
        )
        if self._cancel.is_set():
            return

        if cover_queue:
            self._progress(
                mode=mode,
                phase="covers",
                files_seen=seen_count,
                files_upserted=upserted,
                files_missing=missing,
            )
            with self._db.session() as session:
                extract_covers(
                    session,
                    self._covers,
                    cover_queue,
                    force=(mode == "full"),
                    cancel=self._cancel.is_set,
                )

        if self._cancel.is_set():
            return

        self._progress(
            mode=mode,
            phase="artist_images",
            files_seen=seen_count,
            files_upserted=upserted,
            files_missing=missing,
        )
        fetch_artist_images(
            self._db,
            self._artist_fetcher,
            cancel=self._cancel.is_set,
        )

    def _phase_index(
        self, mode: ScanMode
    ) -> tuple[int, int, set[str], dict[str, Path]]:
        """One filesystem walk: fingerprint/upsert in batches."""
        seen_paths: set[str] = set()
        seen_count = 0
        upserted = 0
        cover_queue: dict[str, Path] = {}
        batch: list[Path] = []

        def flush(batch_paths: list[Path], *, clear_path: bool = False) -> None:
            nonlocal seen_count, upserted, batch
            if not batch_paths:
                return
            s, u, covers = process_batch(
                self._db,
                self._library,
                batch_paths,
                mode,
                cancel=self._cancel.is_set,
            )
            seen_count += s
            upserted += u
            cover_queue.update(covers)
            for p in batch_paths:
                seen_paths.add(self._library.relative_to_root(p))
            last_rel = (
                None
                if clear_path
                else self._library.relative_to_root(batch_paths[-1])
            )
            self._progress(
                mode=mode,
                phase="index",
                files_seen=seen_count,
                files_upserted=upserted,
                current_path=last_rel,
            )
            batch = []

        for path in iter_lossless_audio(
            self._library.root, cancel=self._cancel.is_set
        ):
            if self._cancel.is_set():
                break
            batch.append(path)
            if len(batch) >= BATCH_SIZE:
                flush(batch)

        if batch and not self._cancel.is_set():
            flush(batch, clear_path=True)

        return seen_count, upserted, seen_paths, cover_queue

    def _phase_finalize(
        self,
        mode: ScanMode,
        *,
        seen_count: int,
        upserted: int,
        seen_paths: set[str],
    ) -> int:
        with self._db.session() as session:
            self._set_state(session, phase="finalize")
            self._progress(
                mode=mode,
                phase="finalize",
                files_seen=seen_count,
                files_upserted=upserted,
                persist=False,
            )
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
            persist=False,
        )
        return missing
