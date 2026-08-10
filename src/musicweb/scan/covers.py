"""Cover extraction phase for the library scanner."""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from sqlalchemy.orm import Session

from musicweb.cover import CoverStore
from musicweb.db.models import Album

logger = logging.getLogger(__name__)


def extract_covers(
    session: Session,
    cover_store: CoverStore,
    cover_queue: dict[str, Path],
    *,
    force: bool,
    cancel: Callable[[], bool],
) -> None:
    """
    Ensure album covers for ids queued during index.

    Preserves commit-once-at-end and cancel checks between albums.
    Logs greppable ``Library scan: covers · …`` lines.
    """
    total = len(cover_queue)
    if total == 0:
        return

    processed = 0
    extracted = 0
    logger.info("Library scan: covers · processing %s albums", total)

    for album_id, audio_path in cover_queue.items():
        if cancel():
            break
        processed += 1
        album = session.get(Album, album_id)
        if album is None:
            continue
        if album.has_cover and not force and cover_store.has_cover(album_id):
            continue
        ok = cover_store.ensure_album_cover(album_id, audio_path, force=force)
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

    if cancel():
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
