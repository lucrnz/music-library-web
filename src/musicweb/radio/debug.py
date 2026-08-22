"""Assemble radio debug status dicts for the control plane. Never log upcoming."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from musicweb.radio.station import RadioStation
from musicweb.timeutil import format_iso_utc


class TunerView(Protocol):
    def count(self) -> int: ...
    def profiles(self) -> set[str]: ...


class EmptyTuners:
    def count(self) -> int:
        return 0

    def profiles(self) -> set[str]:
        return set()


def _track_entry(track_id: str, labels: dict[str, dict[str, str]]) -> dict[str, str]:
    info = labels.get(track_id)
    if info is None:
        return {"id": track_id}
    return {"id": track_id, "title": info["title"], "artist": info["artist"]}


def assemble_status(
    station: RadioStation,
    tuners: TunerView,
    *,
    now: datetime,
    spoilers: bool = False,
) -> dict:
    """Face, current, clock, tuners, counts. Upcoming/banlist ids only if spoilers."""
    snap = station.now_playing()
    body: dict = {"face": snap.face}
    if snap.face == "current" and snap.track is not None:
        body["track_id"] = snap.track.id
        body["title"] = snap.track.title
        body["artist"] = snap.track.artist_name
        body["album"] = snap.track.album.title if snap.track.album is not None else None
        body["started_at"] = (
            format_iso_utc(snap.started_at) if snap.started_at is not None else None
        )
        pos = snap.position_seconds(now)
        body["position"] = pos if pos is not None else 0.0
        body["duration"] = (
            snap.duration_ms / 1000.0 if snap.duration_ms is not None else None
        )
    body["tuner_count"] = tuners.count()
    body["tuner_profiles"] = sorted(tuners.profiles())
    body["catalog_watermark"] = station.debug_catalog_watermark()
    body["eligible_count"] = station.debug_eligible_count()
    upcoming_ids = station.debug_upcoming_ids()
    body["upcoming_count"] = len(upcoming_ids)
    banlist = station.debug_banlist_batches()
    body["banlist_batch_sizes"] = [len(batch) for batch in banlist]
    body["skip_ids_count"] = len(station.debug_skip_id_list())
    if spoilers:
        labels = station.debug_track_labels(upcoming_ids)
        body["upcoming"] = [_track_entry(tid, labels) for tid in upcoming_ids]
        ban_ids = [tid for batch in banlist for tid in batch]
        ban_labels = station.debug_track_labels(ban_ids)
        body["banlist"] = [
            [_track_entry(tid, ban_labels) for tid in batch] for batch in banlist
        ]
    return body


def assemble_banlist(station: RadioStation, *, spoilers: bool = False) -> dict:
    banlist = station.debug_banlist_batches()
    body: dict = {"banlist_batch_sizes": [len(batch) for batch in banlist]}
    if spoilers:
        ban_ids = [tid for batch in banlist for tid in batch]
        labels = station.debug_track_labels(ban_ids)
        body["banlist"] = [
            [_track_entry(tid, labels) for tid in batch] for batch in banlist
        ]
    return body


def assemble_skip_ids(station: RadioStation) -> dict:
    ids = station.debug_skip_id_list()
    labels = station.debug_track_labels(ids)
    return {
        "skip_ids_count": len(ids),
        "skip_ids": [_track_entry(tid, labels) for tid in ids],
    }
