"""Shared enrichment batch loop for scan lyrics / artist-image phases."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import TypeVar

from musicweb.db.engine import Database

logger = logging.getLogger(__name__)

T = TypeVar("T")


def iter_enrichment(
    database: Database,
    ids: list[str],
    *,
    load: Callable[..., T | None],
    needs: Callable[[T], bool],
    fetch: Callable[..., object],
    log_prefix: str,
    cancel: Callable[[], bool],
    commit_every: int = 10,
    on_result: Callable[[object], None] | None = None,
) -> int:
    """
    Reopen a session, load each id, fetch when ``needs`` is true, commit every N.

    Logs greppable ``Library scan: {log_prefix} · …`` progress lines.
    Returns how many ids were fetched (not skipped).
    """
    processed = 0
    total = len(ids)
    if total == 0:
        logger.info("Library scan: %s · nothing to do", log_prefix)
        return 0

    logger.info("Library scan: %s · processing %s", log_prefix, total)
    with database.session() as session:
        for entity_id in ids:
            if cancel():
                break
            entity = load(session, entity_id)
            if entity is None:
                continue
            if not needs(entity):
                processed += 1
                continue
            result = fetch(session, entity)
            processed += 1
            if on_result is not None:
                on_result(result)
            if processed % commit_every == 0 or processed == total:
                session.commit()
                logger.info(
                    "Library scan: %s · %s/%s",
                    log_prefix,
                    processed,
                    total,
                )
        session.commit()
    return processed
