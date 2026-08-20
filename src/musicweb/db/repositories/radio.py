"""Radio catalog queries and station persist."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from musicweb.config import RADIO_MIN_DURATION_MS
from musicweb.db.models import (
    Album,
    RadioBanlistItem,
    RadioQueueItem,
    RadioStationState,
    ScanState,
    Track,
)
from musicweb.radio.types import EligibleRow


def list_eligible_rows(session: Session) -> list[EligibleRow]:
    """Present tracks with an album and duration ≥ 30s (lossy included)."""
    rows = session.execute(
        select(
            Track.id,
            Track.rel_path,
            Track.duration_ms,
            Track.album_id,
            Album.artist_id,
        )
        .join(Album, Track.album_id == Album.id)
        .where(
            Track.is_missing.is_(False),
            Track.rel_path.is_not(None),
            Track.duration_ms.is_not(None),
            Track.duration_ms >= RADIO_MIN_DURATION_MS,
            Track.album_id.is_not(None),
        )
    ).all()
    return [
        EligibleRow(
            id=track_id,
            rel_path=rel_path,
            duration_ms=duration_ms,
            album_id=album_id,
            album_artist_id=album_artist_id,
        )
        for track_id, rel_path, duration_ms, album_id, album_artist_id in rows
        if rel_path and duration_ms is not None and album_id
    ]


@dataclass(frozen=True, slots=True)
class PersistedStation:
    current_track_id: str | None
    track_started_at: str | None
    current_batch_seq: int | None
    queue: list[tuple[int, int, str]]
    banlist: list[list[str]]


def scan_finished_at(session: Session) -> str | None:
    """``scan_state.finished_at`` when the last completed job was a library scan."""
    row = session.get(ScanState, 1)
    if row is None or row.kind != "scan":
        return None
    return row.finished_at


def load_station(session: Session) -> PersistedStation:
    row = session.get(RadioStationState, 1)
    queue_rows = session.scalars(
        select(RadioQueueItem).order_by(RadioQueueItem.batch_seq, RadioQueueItem.position)
    ).all()
    ban_rows = session.scalars(
        select(RadioBanlistItem).order_by(
            RadioBanlistItem.batch_seq, RadioBanlistItem.position
        )
    ).all()
    banlist: list[list[str]] = []
    by_seq: dict[int, list[str]] = {}
    for item in ban_rows:
        by_seq.setdefault(item.batch_seq, []).append(item.track_id)
    for seq in sorted(by_seq):
        banlist.append(by_seq[seq])
    return PersistedStation(
        current_track_id=row.current_track_id if row else None,
        track_started_at=row.track_started_at if row else None,
        current_batch_seq=row.current_batch_seq if row else None,
        queue=[(q.batch_seq, q.position, q.track_id) for q in queue_rows],
        banlist=banlist,
    )


def save_station(session: Session, state: PersistedStation) -> None:
    row = session.get(RadioStationState, 1)
    if row is None:
        row = RadioStationState(id=1)
        session.add(row)
    row.current_track_id = state.current_track_id
    row.track_started_at = state.track_started_at
    row.current_batch_seq = state.current_batch_seq
    session.execute(delete(RadioQueueItem))
    session.execute(delete(RadioBanlistItem))
    for batch_seq, position, track_id in state.queue:
        session.add(
            RadioQueueItem(batch_seq=batch_seq, position=position, track_id=track_id)
        )
    for seq, batch in enumerate(state.banlist):
        for position, track_id in enumerate(batch):
            session.add(
                RadioBanlistItem(batch_seq=seq, position=position, track_id=track_id)
            )
