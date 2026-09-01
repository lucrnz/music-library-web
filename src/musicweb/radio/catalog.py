"""Resolve eligible index rows into a picker snapshot."""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy.orm import Session

from musicweb.db.repositories import radio as radio_repo
from musicweb.library import Library
from musicweb.radio.types import CatalogSnapshot, CatalogTrack, EligibleRow

logger = logging.getLogger(__name__)


def snapshot_from_rows(library: Library, rows: Sequence[EligibleRow]) -> CatalogSnapshot:
    """Map eligible rows through ``Library.present_audio``; omit jail/missing paths."""
    artists: dict[str, dict[str, list[CatalogTrack]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        path = library.present_audio(row.rel_path)
        if path is None:
            logger.info("radio catalog: skip %s (missing path)", row.id)
            continue
        track = CatalogTrack(
            id=row.id,
            duration_ms=row.duration_ms,
            path=path,
            album_id=row.album_id,
            album_artist_id=row.album_artist_id,
            artist_id=row.artist_id,
        )
        artists[row.artist_id][row.album_id].append(track)
    return CatalogSnapshot(
        artists={
            artist_id: dict(albums) for artist_id, albums in artists.items()
        }
    )


def load_snapshot(session: Session, library: Library) -> CatalogSnapshot:
    return snapshot_from_rows(library, radio_repo.list_eligible_rows(session))
