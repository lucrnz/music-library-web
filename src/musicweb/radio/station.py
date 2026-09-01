"""Household radio clock: catch-up, tick, persist-on-change."""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from random import Random

from sqlalchemy.orm import Session

from musicweb.config import (
    RADIO_BANLIST_MAX_BATCHES,
    RADIO_MIN_DURATION_MS,
    RADIO_TICK_SECONDS,
)
from musicweb.db.engine import Database
from musicweb.db.models import Track
from musicweb.db.repositories import radio as radio_repo
from musicweb.db.repositories import tracks as tracks_repo
from musicweb.library import Library
from musicweb.radio.catalog import load_snapshot
from musicweb.radio.picker import pick_batch
from musicweb.radio.probe import file_is_playable
from musicweb.radio.types import (
    CatalogSnapshot,
    CatalogTrack,
    DebugMutationResult,
    SnapshotTrack,
    StationSnapshot,
)
from musicweb.timeutil import format_iso_utc, parse_iso_utc

logger = logging.getLogger(__name__)

CatalogBuilder = Callable[[Session], CatalogSnapshot]
Probe = Callable[[Path], bool]
LoopListener = Callable[[], None]


class _OperatorError(Exception):
    """Abort a debug DJ mutation without persisting. ``code`` is the RPC error."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class RadioStation:
    """Process-lifetime household station. Synchronous; caller uses to_thread."""

    def __init__(
        self,
        database: Database,
        library: Library,
        *,
        probe: Probe | None = None,
        rng: Random | None = None,
        catalog_builder: CatalogBuilder | None = None,
    ) -> None:
        self._database = database
        self._library = library
        self._probe = probe or file_is_playable
        self._rng = rng or Random()
        self._catalog_builder = catalog_builder
        self._lock = threading.RLock()
        self.skip_ids: set[str] = set()
        self._catching_up = True
        self._loaded = False
        self._catalog: CatalogSnapshot | None = None
        self._catalog_watermark: str | None = None
        self._loop_listener: LoopListener | None = None
        self._current_track_id: str | None = None
        self._track_started_at: datetime | None = None
        self._current_batch_seq: int | None = None
        self._current_index: int = 0
        self._batches: dict[int, list[str]] = {}
        self._banlist: list[list[str]] = []
        self._next_batch_seq = 1
        self._log_advances = True
        self._snapshot = StationSnapshot(
            face="catching_up",
            started_at=None,
            duration_ms=None,
            track=None,
        )

    def set_loop_listener(self, fn: LoopListener | None) -> None:
        self._loop_listener = fn

    def notify_loop(self) -> None:
        if self._loop_listener is not None:
            self._loop_listener()

    def now_playing(self) -> StationSnapshot:
        with self._lock:
            return self._snapshot

    def peek_upcoming_ids(self, n: int = 2) -> list[str]:
        """Next *n* ids after current. Internal — never serialize."""
        with self._lock:
            return self._peek_upcoming_ids(n)

    def _peek_upcoming_ids(self, n: int) -> list[str]:
        ordered = self._ordered_queue()
        if self._current_track_id is None:
            return []
        ids: list[str] = []
        seen_current = False
        for _seq, _pos, track_id in ordered:
            if not seen_current:
                if track_id == self._current_track_id:
                    seen_current = True
                continue
            ids.append(track_id)
            if len(ids) >= n:
                break
        return ids

    def retained_track_ids(self) -> frozenset[str]:
        """Current plus remaining radio-queue ids. Internal — never serialize."""
        with self._lock:
            current = self._current_track_id
            if current is None:
                return frozenset()
            return frozenset(
                (current, *self._peek_upcoming_ids(len(self._ordered_queue())))
            )

    def _with_session(
        self,
        fn,
        *,
        persist_always: bool = False,
        after=None,
    ) -> None:
        session = self._database.session()
        try:
            dirty = fn(session)
            if persist_always or dirty:
                self._persist(session)
                session.commit()
            else:
                session.rollback()
            if after is not None:
                after(session)
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def run_catchup(self, now: datetime) -> None:
        def after(session: Session) -> None:
            self._catching_up = False
            self._stash_snapshot(session)

        with self._lock:
            self._with_session(lambda session: self._run_catchup(session, now), after=after)

    def tick(self, now: datetime) -> None:
        with self._lock:
            self._with_session(
                lambda session: self._tick(session, now),
                after=lambda session: self._stash_snapshot(session),
            )

    def persist_shutdown(self) -> None:
        with self._lock:
            if self._catching_up and not self._loaded:
                return
            self._with_session(lambda _session: True, persist_always=True)

    def debug_catalog_watermark(self) -> str | None:
        with self._lock:
            session = self._database.session()
            try:
                self._ensure_loaded(session)
                self._refresh_catalog(session)
                return self._catalog_watermark
            finally:
                session.close()

    def debug_eligible_count(self) -> int:
        with self._lock:
            session = self._database.session()
            try:
                self._ensure_loaded(session)
                self._refresh_catalog(session)
                if self._catalog is not None:
                    return len(self._catalog.all_tracks())
                return len(radio_repo.list_eligible_rows(session))
            finally:
                session.close()

    def debug_upcoming_ids(self) -> list[str]:
        with self._lock:
            session = self._database.session()
            try:
                self._ensure_loaded(session)
            finally:
                session.close()
            return self._peek_upcoming_ids(len(self._ordered_queue()))

    def debug_banlist_batches(self) -> list[list[str]]:
        with self._lock:
            session = self._database.session()
            try:
                self._ensure_loaded(session)
            finally:
                session.close()
            return [list(batch) for batch in self._banlist]

    def debug_skip_id_list(self) -> list[str]:
        with self._lock:
            return sorted(self.skip_ids)

    def debug_track_labels(self, ids: list[str]) -> dict[str, dict[str, str]]:
        session = self._database.session()
        try:
            rows = tracks_repo.get_many(session, ids)
            return {
                row.id: {"title": row.title, "artist": row.artist_name} for row in rows
            }
        finally:
            session.close()

    def clear_skip_ids(self) -> DebugMutationResult:
        with self._lock:
            self.skip_ids.clear()
            return DebugMutationResult(ok=True)

    def operator_skip(self, now: datetime) -> DebugMutationResult:
        with self._lock:
            if self._catching_up:
                return DebugMutationResult(ok=False, error="catching_up")
            if self._current_track_id is None:
                return DebugMutationResult(ok=False, error="idle_skip")
            old_current = self._current_track_id
            old_started = self._track_started_at
            logger.info("radio: skip %s (operator)", old_current)

            def work(session: Session) -> bool:
                self._track_started_at = now
                self._advance(session, count_duration=False, duration_ms=None)
                return True

            self._with_session(work, after=lambda session: self._stash_snapshot(session))
            return DebugMutationResult(
                ok=True,
                changed_current=self._current_track_id != old_current,
                changed_started_at=self._track_started_at != old_started,
            )

    def operator_play(self, track_id: str, now: datetime) -> DebugMutationResult:
        with self._lock:
            if self._catching_up:
                return DebugMutationResult(ok=False, error="catching_up")
            if track_id == self._current_track_id:
                return DebugMutationResult(ok=True)
            old_current = self._current_track_id
            old_started = self._track_started_at

            def work(session: Session) -> bool:
                self._ensure_loaded(session)
                track, error = self._resolve_playable(session, track_id)
                if error:
                    raise _OperatorError(error)
                assert track is not None
                if self._current_track_id is None:
                    self._install_batch(session, [track], started_at=now)
                    return True
                self._replace_current_with(track.id)
                self._drop_later_copies(track.id)
                self._ensure_on_banlist(track.id)
                self._current_track_id = track.id
                self._track_started_at = now
                self._maybe_pick_next(session)
                if self._log_advances:
                    self._log_current(session)
                return True

            try:
                self._with_session(
                    work, after=lambda session: self._stash_snapshot(session)
                )
            except _OperatorError as exc:
                return DebugMutationResult(ok=False, error=exc.code)
            return DebugMutationResult(
                ok=True,
                changed_current=self._current_track_id != old_current,
                changed_started_at=self._track_started_at != old_started,
            )

    def operator_pick(self, now: datetime) -> DebugMutationResult:
        with self._lock:
            if self._catching_up:
                return DebugMutationResult(ok=False, error="catching_up")
            old_current = self._current_track_id
            old_started = self._track_started_at

            def work(session: Session) -> bool:
                self._ensure_loaded(session)
                if self._current_track_id is None:
                    if not self._try_start(session, now):
                        raise _OperatorError("no_tracks")
                    return True
                discarded = self._drop_unplayed_remainder()
                for track_id in discarded:
                    self._strip_from_banlist(track_id)
                self._refresh_catalog(session)
                batch = self._pick(session)
                if batch:
                    self._append_batch(batch)
                return True

            try:
                self._with_session(
                    work, after=lambda session: self._stash_snapshot(session)
                )
            except _OperatorError as exc:
                return DebugMutationResult(ok=False, error=exc.code)
            return DebugMutationResult(
                ok=True,
                changed_current=self._current_track_id != old_current,
                changed_started_at=self._track_started_at != old_started,
            )

    def operator_reset(self, now: datetime) -> DebugMutationResult:
        with self._lock:
            if self._catching_up:
                return DebugMutationResult(ok=False, error="catching_up")
            old_current = self._current_track_id
            old_started = self._track_started_at

            def work(session: Session) -> bool:
                self._ensure_loaded(session)
                self.skip_ids.clear()
                self._batches = {}
                self._banlist = []
                self._current_track_id = None
                self._current_batch_seq = None
                self._current_index = 0
                self._next_batch_seq = 1
                self._track_started_at = None
                self._try_start(session, now)
                return True

            self._with_session(work, after=lambda session: self._stash_snapshot(session))
            return DebugMutationResult(
                ok=True,
                changed_current=self._current_track_id != old_current,
                changed_started_at=self._track_started_at != old_started,
            )

    def _ensure_loaded(self, session: Session) -> None:
        if not self._loaded:
            self._load(session)

    def _resolve_playable(
        self, session: Session, track_id: str
    ) -> tuple[CatalogTrack | None, str | None]:
        row = tracks_repo.get(session, track_id)
        if row is None:
            return None, "not_found"
        if (
            row.album_id is None
            or row.artist_id is None
            or row.duration_ms is None
            or row.duration_ms < RADIO_MIN_DURATION_MS
            or row.is_missing
        ):
            return None, "not_eligible"
        path = self._library.present_audio(row.rel_path)
        if path is None:
            return None, "not_eligible"
        if not self._probe(path):
            self.skip_ids.add(row.id)
            return None, "not_eligible"
        return (
            CatalogTrack(
                id=row.id,
                duration_ms=row.duration_ms,
                path=path,
                album_id=row.album_id,
                album_artist_id=row.album_artist_id or row.artist_id or "",
                artist_id=row.artist_id,
            ),
            None,
        )

    def _replace_current_with(self, track_id: str) -> None:
        seq = self._current_batch_seq
        if seq is None or seq not in self._batches:
            seq = self._next_batch_seq
            self._batches[seq] = [track_id]
            self._next_batch_seq = seq + 1
            self._current_batch_seq = seq
            self._current_index = 0
            return
        items = self._batches[seq]
        if self._current_track_id in items:
            self._current_index = items.index(self._current_track_id)
        if self._current_index >= len(items):
            items.append(track_id)
            self._current_index = len(items) - 1
        else:
            items[self._current_index] = track_id

    def _drop_later_copies(self, track_id: str) -> None:
        if self._current_batch_seq is None:
            return
        for seq in list(sorted(self._batches)):
            items = self._batches[seq]
            if seq < self._current_batch_seq:
                continue
            if seq == self._current_batch_seq:
                head = items[: self._current_index + 1]
                tail = [tid for tid in items[self._current_index + 1 :] if tid != track_id]
                self._batches[seq] = head + tail
            else:
                self._batches[seq] = [tid for tid in items if tid != track_id]
                if not self._batches[seq]:
                    del self._batches[seq]

    def _ensure_on_banlist(self, track_id: str) -> None:
        if any(track_id in batch for batch in self._banlist):
            return
        if self._banlist:
            self._banlist[-1].append(track_id)
        else:
            self._banlist.append([track_id])
        if len(self._banlist) > RADIO_BANLIST_MAX_BATCHES:
            self._banlist = self._banlist[-2:]

    def _drop_unplayed_remainder(self) -> list[str]:
        discarded: list[str] = []
        if self._current_batch_seq is None:
            return discarded
        for seq in list(sorted(self._batches)):
            items = self._batches[seq]
            if seq < self._current_batch_seq:
                continue
            if seq == self._current_batch_seq:
                discarded.extend(
                    tid for tid in items[self._current_index + 1 :] if tid
                )
                self._batches[seq] = items[: self._current_index + 1]
            else:
                discarded.extend(tid for tid in items if tid)
                del self._batches[seq]
        return discarded

    def _step(self, session: Session, now: datetime, *, skip_blocks: bool) -> bool:
        if self._current_track_id is None:
            return self._try_start(session, now)

        row = tracks_repo.get(session, self._current_track_id)
        if row is None or row.duration_ms is None:
            if not skip_blocks:
                return False
            self._skip_current(session, "missing")
            return True
        reason = self._current_block_reason(session, row)
        if reason == "path" and not skip_blocks:
            return False
        if reason in {"path", "probe", "skip"}:
            self._skip_current(session, reason)
            return True
        if self._track_started_at is None:
            self._track_started_at = now
            return True
        end = self._track_started_at + timedelta(milliseconds=row.duration_ms)
        if end <= now:
            self._advance(session, count_duration=True, duration_ms=row.duration_ms)
            return True
        return False

    def _run_catchup(self, session: Session, now: datetime) -> bool:
        self._load(session)
        self._log_advances = False
        try:
            dirty = False
            advanced = 0
            if self._current_track_id is None:
                if self._try_start(session, now):
                    dirty = True
                return dirty

            while self._current_track_id is not None:
                before = self._current_track_id
                stepped = self._step(session, now, skip_blocks=False)
                if not stepped:
                    break
                dirty = True
                if self._current_track_id != before:
                    advanced += 1
                    continue
                break

            if advanced:
                logger.info("radio: catch-up advanced %s tracks", advanced)
            return dirty
        finally:
            self._log_advances = True
            if self._current_track_id:
                self._log_current(session)

    def _tick(self, session: Session, now: datetime) -> bool:
        if not self._loaded:
            self._load(session)
        return self._step(session, now, skip_blocks=True)

    def _try_start(self, session: Session, now: datetime) -> bool:
        self._refresh_catalog(session)
        batch = self._pick(session)
        if not batch:
            return False
        self._install_batch(session, batch, started_at=now)
        return True

    def _load(self, session: Session) -> None:
        persisted = radio_repo.load_station(session)
        self._current_track_id = persisted.current_track_id
        self._track_started_at = parse_iso_utc(persisted.track_started_at)
        self._current_batch_seq = persisted.current_batch_seq
        self._batches = {}
        for batch_seq, position, track_id in persisted.queue:
            items = self._batches.setdefault(batch_seq, [])
            while len(items) <= position:
                items.append("")
            items[position] = track_id
        self._banlist = [list(batch) for batch in persisted.banlist]
        self._next_batch_seq = (max(self._batches) + 1) if self._batches else 1
        self._current_index = 0
        if self._current_batch_seq is not None:
            items = self._batches.get(self._current_batch_seq, [])
            if self._current_track_id in items:
                self._current_index = items.index(self._current_track_id)
        self._loaded = True

    def _persist(self, session: Session) -> None:
        banlist = list(self._banlist)
        if len(banlist) > RADIO_BANLIST_MAX_BATCHES:
            banlist = banlist[-2:]
            self._banlist = banlist
        queue: list[tuple[int, int, str]] = []
        for batch_seq in sorted(self._batches):
            for position, track_id in enumerate(self._batches[batch_seq]):
                if track_id:
                    queue.append((batch_seq, position, track_id))
        radio_repo.save_station(
            session,
            radio_repo.PersistedStation(
                current_track_id=self._current_track_id,
                track_started_at=(
                    format_iso_utc(self._track_started_at)
                    if self._track_started_at
                    else None
                ),
                current_batch_seq=self._current_batch_seq,
                queue=queue,
                banlist=banlist,
            ),
        )

    def _stash_snapshot(self, session: Session) -> None:
        if self._catching_up:
            self._snapshot = StationSnapshot(
                face="catching_up",
                started_at=None,
                duration_ms=None,
                track=None,
            )
            return
        if self._current_track_id is None:
            self._snapshot = StationSnapshot(
                face="idle",
                started_at=None,
                duration_ms=None,
                track=None,
            )
            return
        row = tracks_repo.get(session, self._current_track_id)
        duration_ms = row.duration_ms if row is not None else None
        resolvable = False
        if row is not None:
            resolvable = (
                not row.is_missing
                and self._library.present_audio(row.rel_path) is not None
            )
        if row is None or duration_ms is None or not resolvable:
            self._snapshot = StationSnapshot(
                face="skip_pending",
                started_at=self._track_started_at,
                duration_ms=None,
                track=None,
            )
            return
        self._snapshot = StationSnapshot(
            face="current",
            started_at=self._track_started_at,
            duration_ms=duration_ms,
            track=SnapshotTrack.from_track(row),
        )

    def _current_block_reason(self, session: Session, row: Track) -> str | None:
        if row.id in self.skip_ids:
            return "skip"
        path = (
            None
            if row.is_missing
            else self._library.present_audio(row.rel_path)
        )
        if path is None:
            return "path"
        if not self._probe(path):
            self.skip_ids.add(row.id)
            return "probe"
        return None

    def _skip_current(self, session: Session, reason: str) -> None:
        track_id = self._current_track_id
        if track_id:
            self.skip_ids.add(track_id)
            self._strip_from_banlist(track_id)
            logger.info("radio: skip %s (%s)", track_id, reason)
        self._advance(session, count_duration=False, duration_ms=None)

    def _strip_from_banlist(self, track_id: str) -> None:
        self._banlist = [
            [tid for tid in batch if tid != track_id] for batch in self._banlist
        ]
        self._banlist = [batch for batch in self._banlist if batch]

    def _advance(
        self,
        session: Session,
        *,
        count_duration: bool,
        duration_ms: int | None,
    ) -> None:
        if count_duration and duration_ms and self._track_started_at is not None:
            self._track_started_at = self._track_started_at + timedelta(
                milliseconds=duration_ms
            )
        nxt = self._next_queue_item()
        if nxt is None:
            self._drop_finished_batches()
            if self._try_start(session, self._track_started_at or datetime.now(timezone.utc)):
                return
            self._current_track_id = None
            self._current_batch_seq = None
            self._batches = {}
            return
        seq, index, track_id = nxt
        self._drop_batches_before(seq)
        self._current_batch_seq = seq
        self._current_index = index
        self._current_track_id = track_id
        self._maybe_pick_next(session)
        if self._log_advances:
            self._log_current(session)

    def _maybe_pick_next(self, session: Session) -> None:
        if self._current_batch_seq is None:
            return
        items = self._batches.get(self._current_batch_seq, [])
        if self._current_index != len(items) - 1:
            return
        next_seq = self._current_batch_seq + 1
        if next_seq in self._batches:
            return
        self._refresh_catalog(session)
        batch = self._pick(session)
        if not batch:
            return
        self._append_batch(batch)

    def _install_batch(
        self,
        session: Session,
        batch: list[CatalogTrack],
        *,
        started_at: datetime,
    ) -> None:
        seq = self._next_batch_seq
        self._append_batch(batch)
        self._current_batch_seq = seq
        self._current_index = 0
        self._current_track_id = batch[0].id
        self._track_started_at = started_at
        self._maybe_pick_next(session)
        if self._log_advances:
            self._log_current(session)

    def _append_batch(self, batch: list[CatalogTrack]) -> None:
        seq = self._next_batch_seq
        self._batches[seq] = [t.id for t in batch]
        self._next_batch_seq = seq + 1
        self._banlist.append([t.id for t in batch])
        if len(self._banlist) >= RADIO_BANLIST_MAX_BATCHES + 1:
            self._banlist = self._banlist[-2:]

    def _pick(self, session: Session) -> list[CatalogTrack]:
        self._refresh_catalog(session)
        assert self._catalog is not None
        return pick_batch(
            self._catalog,
            list(self._banlist),
            self.skip_ids,
            self._rng,
            self._probe,
        )

    def _refresh_catalog(self, session: Session) -> bool:
        watermark = radio_repo.scan_finished_at(session)
        if self._catalog is not None and watermark == self._catalog_watermark:
            return False
        if self._catalog_builder is not None:
            self._catalog = self._catalog_builder(session)
        else:
            self._catalog = load_snapshot(session, self._library)
        self._catalog_watermark = watermark
        return True

    def _next_queue_item(self) -> tuple[int, int, str] | None:
        ordered = self._ordered_queue()
        if self._current_batch_seq is None:
            return ordered[0] if ordered else None
        for seq, index, track_id in ordered:
            if seq == self._current_batch_seq and index > self._current_index:
                return seq, index, track_id
            if seq > self._current_batch_seq:
                return seq, index, track_id
        return None

    def _ordered_queue(self) -> list[tuple[int, int, str]]:
        out: list[tuple[int, int, str]] = []
        for seq in sorted(self._batches):
            for index, track_id in enumerate(self._batches[seq]):
                if track_id:
                    out.append((seq, index, track_id))
        return out

    def _drop_batches_before(self, seq: int) -> None:
        for old in [s for s in self._batches if s < seq]:
            del self._batches[old]

    def _drop_finished_batches(self) -> None:
        if self._current_batch_seq is not None:
            self._drop_batches_before(self._current_batch_seq + 1)

    def _log_current(self, session: Session) -> None:
        track_id = self._current_track_id
        if not track_id:
            return
        row = tracks_repo.get(session, track_id)
        if row is None:
            logger.info("radio: now playing %s (simulation, tuners=0)", track_id)
            return
        logger.info(
            "radio: now playing %s — %s (simulation, tuners=0)",
            row.title,
            row.artist_name,
        )


async def run_radio_worker(
    station: RadioStation,
    stop: asyncio.Event,
) -> None:
    """Lifespan task: catch-up then tick. Persist once on the way out."""
    logger.info("radio: worker started (simulation)")
    try:
        await asyncio.to_thread(station.run_catchup, datetime.now(timezone.utc))
        station.notify_loop()
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=RADIO_TICK_SECONDS)
                break
            except asyncio.TimeoutError:
                pass
            if stop.is_set():
                break
            await asyncio.to_thread(station.tick, datetime.now(timezone.utc))
            station.notify_loop()
    finally:
        try:
            await asyncio.to_thread(station.persist_shutdown)
        except Exception:
            logger.exception("radio: shutdown persist failed")
