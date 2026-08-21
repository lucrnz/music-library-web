"""Household radio clock: catch-up, tick, persist-on-change."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from random import Random

from sqlalchemy.orm import Session

from musicweb.config import RADIO_BANLIST_MAX_BATCHES, RADIO_TICK_SECONDS
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
    SnapshotAlbum,
    SnapshotTrack,
    StationSnapshot,
)
from musicweb.timeutil import parse_iso_utc

logger = logging.getLogger(__name__)

CatalogBuilder = Callable[[Session], CatalogSnapshot]
Probe = Callable[[Path], bool]
LoopListener = Callable[[], None]


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _snapshot_track(row: Track) -> SnapshotTrack:
    album = SnapshotAlbum(title=row.album.title) if row.album is not None else None
    return SnapshotTrack(
        id=row.id,
        rel_path=row.rel_path,
        is_missing=bool(row.is_missing),
        title=row.title,
        artist_name=row.artist_name,
        album=album,
        album_id=row.album_id,
        artist_id=row.artist_id,
        album_artist_name=row.album_artist_name,
        album_artist_id=row.album_artist_id,
        track_no=row.track_no,
        disc_no=row.disc_no,
        year=row.year,
        duration_ms=row.duration_ms,
        sample_rate_hz=row.sample_rate_hz,
        bit_depth=row.bit_depth,
        is_lossy=bool(row.is_lossy),
        source_codec=row.source_codec,
        bitrate_kbps=row.bitrate_kbps,
        bitrate_mode=row.bitrate_mode,
    )


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
        return self._snapshot

    def peek_upcoming_ids(self, n: int = 2) -> list[str]:
        """Next *n* ids after current. Internal — never serialize."""
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
        current = self._current_track_id
        if current is None:
            return frozenset()
        return frozenset(
            (current, *self.peek_upcoming_ids(len(self._ordered_queue())))
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

        self._with_session(lambda session: self._run_catchup(session, now), after=after)

    def tick(self, now: datetime) -> None:
        self._with_session(
            lambda session: self._tick(session, now),
            after=lambda session: self._stash_snapshot(session),
        )

    def persist_shutdown(self) -> None:
        if self._catching_up and not self._loaded:
            return
        self._with_session(lambda _session: True, persist_always=True)

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
                    _iso(self._track_started_at) if self._track_started_at else None
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
            track=_snapshot_track(row),
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
