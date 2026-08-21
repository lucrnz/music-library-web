"""Cover extraction phase for the library scanner."""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from musicweb.cover import CoverStore
from musicweb.db.models import Album, Track
from musicweb.library import Library

logger = logging.getLogger(__name__)


def album_cover_sources(session: Session, library: Library) -> dict[str, Path]:
    """
    Map album_id → sample present track path for cover extraction.

    Used by regen-covers (no filesystem walk). One non-missing track per album.
    """
    rows = session.execute(
        select(Track.album_id, Track.rel_path)
        .where(
            Track.is_missing.is_(False),
            Track.album_id.is_not(None),
            Track.rel_path.is_not(None),
        )
        .order_by(Track.album_id, Track.disc_no, Track.track_no, Track.id)
    ).all()
    out: dict[str, Path] = {}
    for album_id, rel_path in rows:
        if album_id is None or rel_path is None or album_id in out:
            continue
        path = library.present_audio(rel_path)
        if path is None:
            continue
        out[album_id] = path
    return out


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
