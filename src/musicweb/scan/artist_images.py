"""Artist portrait fetch phase for the library scanner."""

from __future__ import annotations

import logging
from collections.abc import Callable

from sqlalchemy import select

from musicweb.artist_images import ArtistImageFetcher
from musicweb.db.engine import Database
from musicweb.db.models import Artist
from musicweb.db.va import VA_ARTIST_ID
from musicweb.scan.enrichment import iter_enrichment

logger = logging.getLogger(__name__)


def fetch_artist_images(
    database: Database,
    fetcher: ArtistImageFetcher,
    *,
    cancel: Callable[[], bool],
    force: bool = False,
) -> None:
    """
    Fetch artist portraits (local then remote cascade).

    *force* re-fetches all artists with albums (overwrite store, skip cooldown).
    Commit cadence and cancel checks match the pre-extract scanner loop.
    Logs greppable ``Library scan: artist_images · …`` lines.
    """
    with database.session() as session:
        artists = list(
            session.scalars(
                select(Artist)
                .where(Artist.album_count > 0, Artist.id != VA_ARTIST_ID)
                .order_by(Artist.sort_name, Artist.name)
            ).all()
        )
        todo = [a for a in artists if fetcher.needs_fetch(a, force=force)]

    total = len(todo)
    if total == 0:
        logger.info("Library scan: artist_images · nothing to do")
        return

    ok_count = 0
    local_count = 0
    remote_count = 0
    not_found = 0
    errors = 0

    def on_result(result: object) -> None:
        nonlocal ok_count, local_count, remote_count, not_found, errors
        status = getattr(result, "status", None)
        if getattr(result, "ok", False):
            ok_count += 1
            if getattr(result, "source", None) == "local":
                local_count += 1
            else:
                remote_count += 1
        elif status == "error":
            errors += 1
        else:
            not_found += 1

    processed = iter_enrichment(
        database,
        [a.id for a in todo],
        load=lambda session, artist_id: session.get(Artist, artist_id),
        needs=lambda artist: fetcher.needs_fetch(artist, force=force),
        fetch=lambda session, artist: fetcher.fetch_one(
            session, artist, cancel=cancel, force=force
        ),
        log_prefix="artist_images",
        cancel=cancel,
        on_result=on_result,
    )

    if cancel():
        logger.info(
            "Library scan: artist_images canceled · %s/%s "
            "(%s ok, %s not_found, %s error)",
            processed,
            total,
            ok_count,
            not_found,
            errors,
        )
    else:
        logger.info(
            "Library scan: artist_images done · %s artists "
            "(%s ok: %s local, %s remote; %s not_found; %s error)",
            total,
            ok_count,
            local_count,
            remote_count,
            not_found,
            errors,
        )
