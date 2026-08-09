"""Background library scanner with quick/full modes and cancel support."""

from __future__ import annotations

import logging
import threading
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from musicweb.artist_image import ArtistImageStore
from musicweb.artist_image_fetch import ArtistImageFetcher
from musicweb.config import Settings
from musicweb.cover import CoverStore
from musicweb.db.engine import Database
from musicweb.db.fts import fts_rebuild
from musicweb.db.models import Album, Artist, ScanState, Track
from musicweb.library import Library
from musicweb.metadata import read_metadata
from musicweb.scan.fingerprint import compute_fingerprint
from musicweb.scan.formats import is_lossless_audio
from musicweb.scan.identity import apply_track_fields, resolve_track

logger = logging.getLogger(__name__)

ScanMode = Literal["quick", "full"]
BATCH_SIZE = 100


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class LibraryScanner:
    """Single-worker background scanner."""

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

    def _log_progress(
        self,
        *,
        mode: ScanMode | str | None,
        phase: str | None,
        files_seen: int,
        files_upserted: int,
        files_missing: int = 0,
        files_total_hint: int | None = None,
        current_path: str | None = None,
        status: str | None = None,
    ) -> None:
        """Log scan progress to the terminal (mirrors UI status fields)."""
        if status is None:
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
        total = st.get("files_total_hint")
        verb = "canceled" if canceled else "finished"
        if total and total > 0:
            logger.info(
                "Library scan %s (mode=%s) · seen %s/%s · updated %s · missing %s",
                verb,
                mode,
                seen,
                total,
                upserted,
                missing,
            )
        else:
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
                    started_at=_utc_now(),
                    finished_at=None,
                    phase="walk",
                    files_seen=0,
                    files_upserted=0,
                    files_missing=0,
                    files_total_hint=None,
                    current_path=None,
                    last_error=None,
                )
            self._log_progress(
                mode=mode,
                phase="walk",
                files_seen=0,
                files_upserted=0,
            )
            self._scan(mode)
            with self._db.session() as session:
                self._set_state(
                    session,
                    status="idle",
                    finished_at=_utc_now(),
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
                    finished_at=_utc_now(),
                    phase=None,
                    current_path=None,
                    last_error=str(exc)[:2000],
                )
        finally:
            with self._lock:
                self._running = False
                self._thread = None

    def _iter_audio(self) -> Iterator[Path]:
        """Stream audio files under the library root (no full materialization)."""
        root = self._library.root
        for path in root.rglob("*"):
            if self._cancel.is_set():
                return
            if path.name.startswith("."):
                continue
            try:
                if not path.is_file():
                    continue
            except OSError:
                continue
            if is_lossless_audio(path):
                yield path

    def _count_audio(self, mode: ScanMode) -> int:
        """Cancelable count of audio files; logs intermediate walk progress."""
        total = 0
        for _ in self._iter_audio():
            total += 1
            if total % 1000 == 0:
                self._log_progress(
                    mode=mode,
                    phase="walk",
                    files_seen=total,
                    files_upserted=0,
                    files_total_hint=None,
                )
        return total

    def _scan(self, mode: ScanMode) -> None:
        total_hint = self._count_audio(mode)
        if self._cancel.is_set():
            return

        with self._db.session() as session:
            self._set_state(
                session,
                phase="index",
                files_total_hint=total_hint,
            )
        self._log_progress(
            mode=mode,
            phase="index",
            files_seen=0,
            files_upserted=0,
            files_total_hint=total_hint,
        )

        seen_paths: set[str] = set()
        seen_count = 0
        upserted = 0
        cover_queue: dict[str, Path] = {}
        batch: list[Path] = []
        last_rel = ""

        for path in self._iter_audio():
            if self._cancel.is_set():
                break
            batch.append(path)
            if len(batch) < BATCH_SIZE:
                continue
            s, u, covers = self._process_batch(batch, mode)
            seen_count += s
            upserted += u
            cover_queue.update(covers)
            for p in batch:
                seen_paths.add(self._library.relative_to_root(p))
            last_rel = self._library.relative_to_root(batch[-1])
            batch = []
            with self._db.session() as session:
                self._set_state(
                    session,
                    files_seen=seen_count,
                    files_upserted=upserted,
                    current_path=last_rel,
                )
            self._log_progress(
                mode=mode,
                phase="index",
                files_seen=seen_count,
                files_upserted=upserted,
                files_total_hint=total_hint,
                current_path=last_rel,
            )

        if batch and not self._cancel.is_set():
            s, u, covers = self._process_batch(batch, mode)
            seen_count += s
            upserted += u
            cover_queue.update(covers)
            for p in batch:
                seen_paths.add(self._library.relative_to_root(p))
            with self._db.session() as session:
                self._set_state(
                    session,
                    files_seen=seen_count,
                    files_upserted=upserted,
                    current_path=None,
                )
            self._log_progress(
                mode=mode,
                phase="index",
                files_seen=seen_count,
                files_upserted=upserted,
                files_total_hint=total_hint,
            )

        if self._cancel.is_set():
            return

        with self._db.session() as session:
            self._set_state(session, phase="finalize")
            self._log_progress(
                mode=mode,
                phase="finalize",
                files_seen=seen_count,
                files_upserted=upserted,
                files_total_hint=total_hint,
            )
            missing = self._mark_missing(session, seen_paths)
            self._recount_entities(session)
            if mode == "full":
                fts_rebuild(session)
            session.commit()
            self._set_state(
                session,
                files_seen=seen_count,
                files_upserted=upserted,
                files_missing=missing,
            )
        self._log_progress(
            mode=mode,
            phase="finalize",
            files_seen=seen_count,
            files_upserted=upserted,
            files_missing=missing,
            files_total_hint=total_hint,
        )

        if cover_queue and not self._cancel.is_set():
            with self._db.session() as session:
                self._set_state(session, phase="covers")
            self._log_progress(
                mode=mode,
                phase="covers",
                files_seen=seen_count,
                files_upserted=upserted,
                files_missing=missing,
                files_total_hint=total_hint,
            )
            self._extract_covers(cover_queue, force=(mode == "full"))

        if not self._cancel.is_set():
            with self._db.session() as session:
                self._set_state(session, phase="artist_images")
            self._log_progress(
                mode=mode,
                phase="artist_images",
                files_seen=seen_count,
                files_upserted=upserted,
                files_missing=missing,
                files_total_hint=total_hint,
            )
            self._fetch_artist_images()

    def _process_batch(
        self, paths: list[Path], mode: ScanMode
    ) -> tuple[int, int, dict[str, Path]]:
        seen = 0
        upserted = 0
        covers: dict[str, Path] = {}
        with self._db.session() as session:
            for path in paths:
                if self._cancel.is_set():
                    break
                try:
                    rel = self._library.relative_to_root(path)
                    stat = path.stat()
                    size = int(stat.st_size)
                    mtime_ns = int(
                        getattr(stat, "st_mtime_ns", int(stat.st_mtime * 1e9))
                    )
                except OSError:
                    continue

                seen += 1
                existing = session.execute(
                    select(Track).where(Track.rel_path == rel)
                ).scalar_one_or_none()

                if (
                    existing is not None
                    and mode == "quick"
                    and existing.size_bytes == size
                    and existing.mtime_ns == mtime_ns
                    and not existing.is_missing
                ):
                    continue

                try:
                    fp = compute_fingerprint(path)
                except OSError as exc:
                    logger.debug("fingerprint failed %s: %s", rel, exc)
                    continue

                now = _utc_now()
                track = resolve_track(
                    session,
                    fingerprint=fp.fingerprint,
                    fingerprint_algo=fp.algo,
                    track_id=fp.track_id,
                    rel_path=rel,
                    existing_by_path=existing,
                    now=now,
                )
                meta = read_metadata(path)
                album_id = apply_track_fields(
                    session,
                    track,
                    path=path,
                    size=size,
                    mtime_ns=mtime_ns,
                    meta=meta,
                    now=now,
                )
                upserted += 1
                if album_id:
                    covers[album_id] = path

            session.commit()
        return seen, upserted, covers

    def _mark_missing(self, session: Session, seen_paths: set[str]) -> int:
        """Mark present tracks not seen this scan as missing; clear rel_path."""
        if not seen_paths:
            result = session.execute(
                update(Track)
                .where(Track.is_missing.is_(False), Track.rel_path.is_not(None))
                .values(is_missing=True, rel_path=None)
            )
            return result.rowcount or 0

        # Temp table of seen paths for set difference (scales better than NOT IN list).
        session.execute(text("CREATE TEMP TABLE IF NOT EXISTS _seen_paths (p TEXT PRIMARY KEY)"))
        session.execute(text("DELETE FROM _seen_paths"))
        session.execute(
            text("INSERT INTO _seen_paths (p) VALUES (:p)"),
            [{"p": p} for p in seen_paths],
        )
        result = session.execute(
            text(
                """
                UPDATE tracks
                SET is_missing = 1, rel_path = NULL
                WHERE is_missing = 0
                  AND rel_path IS NOT NULL
                  AND rel_path NOT IN (SELECT p FROM _seen_paths)
                """
            )
        )
        session.execute(text("DROP TABLE IF EXISTS _seen_paths"))
        return result.rowcount or 0

    def _recount_entities(self, session: Session) -> None:
        session.execute(
            text(
                """
                UPDATE albums SET track_count = (
                  SELECT COUNT(*) FROM tracks
                  WHERE tracks.album_id = albums.id AND tracks.is_missing = 0
                )
                """
            )
        )
        session.execute(
            text(
                """
                UPDATE artists SET album_count = (
                  SELECT COUNT(*) FROM albums
                  WHERE albums.artist_id = artists.id AND albums.track_count > 0
                ),
                track_count = (
                  SELECT COUNT(*) FROM tracks
                  WHERE tracks.album_artist_id = artists.id AND tracks.is_missing = 0
                )
                """
            )
        )

    def _extract_covers(self, cover_queue: dict[str, Path], *, force: bool) -> None:
        total = len(cover_queue)
        processed = 0
        extracted = 0
        logger.info("Library scan: covers · processing %s albums", total)
        with self._db.session() as session:
            for album_id, audio_path in cover_queue.items():
                if self._cancel.is_set():
                    break
                processed += 1
                album = session.get(Album, album_id)
                if album is None:
                    continue
                if album.has_cover and not force and self._covers.has_cover(album_id):
                    continue
                ok = self._covers.ensure_album_cover(album_id, audio_path, force=force)
                album.has_cover = bool(ok)
                if ok:
                    extracted += 1
                if processed % 25 == 0 or processed == total:
                    logger.info(
                        "Library scan: covers · %s/%s albums (%s extracted)",
                        processed,
                        total,
                        extracted,
                    )
            session.commit()
        if self._cancel.is_set():
            logger.info(
                "Library scan: covers canceled · %s/%s albums (%s extracted)",
                processed,
                total,
                extracted,
            )
        else:
            logger.info(
                "Library scan: covers done · %s albums (%s extracted)",
                total,
                extracted,
            )

    def _fetch_artist_images(self) -> None:
        """Fetch missing artist portraits (local then remote cascade)."""
        with self._db.session() as session:
            artists = list(
                session.scalars(
                    select(Artist)
                    .where(Artist.album_count > 0)
                    .order_by(Artist.sort_name, Artist.name)
                ).all()
            )
            todo = [a for a in artists if self._artist_fetcher.needs_fetch(a)]

        total = len(todo)
        if total == 0:
            logger.info("Library scan: artist_images · nothing to do")
            return

        processed = 0
        ok_count = 0
        local_count = 0
        remote_count = 0
        not_found = 0
        errors = 0
        logger.info("Library scan: artist_images · processing %s artists", total)

        with self._db.session() as session:
            for artist_id in [a.id for a in todo]:
                if self._cancel.is_set():
                    break
                artist = session.get(Artist, artist_id)
                if artist is None:
                    continue
                # Re-check after possible concurrent disk state.
                if not self._artist_fetcher.needs_fetch(artist):
                    processed += 1
                    continue
                result = self._artist_fetcher.fetch_one(
                    session, artist, cancel=self._cancel.is_set
                )
                processed += 1
                if result.ok:
                    ok_count += 1
                    if result.source == "local":
                        local_count += 1
                    else:
                        remote_count += 1
                elif result.status == "error":
                    errors += 1
                else:
                    not_found += 1
                if processed % 10 == 0 or processed == total:
                    session.commit()
                    logger.info(
                        "Library scan: artist_images · %s/%s "
                        "(%s ok: %s local, %s remote; %s not_found; %s error)",
                        processed,
                        total,
                        ok_count,
                        local_count,
                        remote_count,
                        not_found,
                        errors,
                    )
            session.commit()

        if self._cancel.is_set():
            logger.info(
                "Library scan: artist_images canceled · %s/%s "
                "(%s ok, %s not_found, %s error)",
                processed,
                total,
                ok_count,
                not_found,
                errors,
            )
        else:
            logger.info(
                "Library scan: artist_images done · %s artists "
                "(%s ok: %s local, %s remote; %s not_found; %s error)",
                total,
                ok_count,
                local_count,
                remote_count,
                not_found,
                errors,
            )
