"""Per-batch track fingerprint + identity upsert for the library scanner."""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path
from typing import Literal

from sqlalchemy import select

from musicweb.db.engine import Database
from musicweb.db.models import Track
from musicweb.library import Library
from musicweb.metadata import read_metadata
from musicweb.scan.fingerprint import compute_fingerprint
from musicweb.scan.identity import apply_track_fields, resolve_track
from musicweb.timeutil import utc_now_iso

logger = logging.getLogger(__name__)

ScanMode = Literal["quick", "full"]


def process_batch(
    database: Database,
    library: Library,
    paths: list[Path],
    mode: ScanMode,
    *,
    cancel: Callable[[], bool] | None = None,
) -> tuple[int, int, dict[str, Path]]:
    """
    Index a batch of audio paths.

    Returns ``(seen, upserted, cover_queue)`` where cover_queue maps
    album_id → representative audio path.
    """
    seen = 0
    upserted = 0
    covers: dict[str, Path] = {}
    with database.session() as session:
        for path in paths:
            if cancel and cancel():
                break
            try:
                rel = library.relative_to_root(path)
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

            now = utc_now_iso()
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
