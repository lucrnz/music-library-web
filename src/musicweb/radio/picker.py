"""Pure batch picker: album artist → album → track, with loosening."""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path
from random import Random

from musicweb.config import (
    RADIO_BANLIST_MAX_BATCHES,
    RADIO_BATCH_SIZE,
    RADIO_MAX_PER_ARTIST,
    RADIO_PICK_ATTEMPTS,
)
from musicweb.radio.types import CatalogSnapshot, CatalogTrack

logger = logging.getLogger(__name__)

Probe = Callable[[Path], bool]


def pick_batch(
    snapshot: CatalogSnapshot,
    banlist_batches: list[list[str]],
    skip_ids: set[str],
    rng: Random,
    probe: Probe,
) -> list[CatalogTrack]:
    """Pick one batch. Mutates ``skip_ids`` on probe failure. Does not persist."""
    working = snapshot.copy()
    for track_id in list(skip_ids):
        working.remove_track(track_id)

    banned_batches = _effective_banlist(banlist_batches)
    ban_drop = 0
    cap_enabled = True
    batch: list[CatalogTrack] = []

    while len(batch) < RADIO_BATCH_SIZE:
        picked = _try_slot(
            working,
            batch,
            banned_batches[ban_drop:],
            skip_ids,
            rng,
            probe,
            cap_enabled=cap_enabled,
        )
        if picked is not None:
            batch.append(picked)
            working.remove_track(picked.id)
            continue
        if ban_drop < len(banned_batches):
            ban_drop += 1
            continue
        if cap_enabled:
            cap_enabled = False
            continue
        break
    return batch


def _effective_banlist(banlist_batches: list[list[str]]) -> list[set[str]]:
    if len(banlist_batches) >= RADIO_BANLIST_MAX_BATCHES:
        return [set(banlist_batches[-1])]
    return [set(batch) for batch in banlist_batches]


def _try_slot(
    snapshot: CatalogSnapshot,
    batch: list[CatalogTrack],
    banned_batches: list[set[str]],
    skip_ids: set[str],
    rng: Random,
    probe: Probe,
    *,
    cap_enabled: bool,
) -> CatalogTrack | None:
    banned = set().union(*banned_batches) if banned_batches else set()
    in_batch = {t.id for t in batch}
    exclude = banned | in_batch | skip_ids
    counts: dict[str, int] = {}
    for track in batch:
        counts[track.album_artist_id] = counts.get(track.album_artist_id, 0) + 1

    graph = _remaining_graph(snapshot, exclude)
    if not graph:
        return None

    for _ in range(RADIO_PICK_ATTEMPTS):
        artist_id = rng.choice(sorted(graph))
        album_id = rng.choice(sorted(graph[artist_id]))
        tracks = graph[artist_id][album_id]
        track = rng.choice(sorted(tracks, key=lambda t: t.id))
        if cap_enabled and counts.get(track.album_artist_id, 0) >= RADIO_MAX_PER_ARTIST:
            continue
        if not probe(track.path):
            skip_ids.add(track.id)
            snapshot.remove_track(track.id)
            logger.info("radio pick: ffprobe failed for track %s", track.id)
            exclude.add(track.id)
            graph = _remaining_graph(snapshot, exclude)
            if not graph:
                return None
            continue
        return track
    return None


def _remaining_graph(
    snapshot: CatalogSnapshot,
    exclude_ids: set[str],
) -> dict[str, dict[str, list[CatalogTrack]]]:
    artists: dict[str, dict[str, list[CatalogTrack]]] = {}
    for artist_id, albums in snapshot.artists.items():
        kept_albums: dict[str, list[CatalogTrack]] = {}
        for album_id, tracks in albums.items():
            kept = [t for t in tracks if t.id not in exclude_ids]
            if kept:
                kept_albums[album_id] = kept
        if kept_albums:
            artists[artist_id] = kept_albums
    return artists
