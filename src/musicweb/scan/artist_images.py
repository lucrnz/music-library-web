"""Artist portrait fetch phase for the library scanner."""

from __future__ import annotations

import logging
from collections.abc import Callable

from sqlalchemy import select

from musicweb.artist_images import ArtistImageFetcher
from musicweb.db.engine import Database
from musicweb.db.models import Artist

logger = logging.getLogger(__name__)


def fetch_artist_images(
    database: Database,
    fetcher: ArtistImageFetcher,
    *,
    cancel: Callable[[], bool],
) -> None:
    """
    Fetch missing artist portraits (local then remote cascade).

    Commit cadence and cancel checks match the pre-extract scanner loop.
    Logs greppable ``Library scan: artist_images · …`` lines.
    """
    with database.session() as session:
        artists = list(
            session.scalars(
                select(Artist)
                .where(Artist.album_count > 0)
                .order_by(Artist.sort_name, Artist.name)
            ).all()
        )
        todo = [a for a in artists if fetcher.needs_fetch(a)]

    total = len(todo)
    if total == 0:
        logger.info("Library scan: artist_images · nothing to do")
        return

    processed = 0
    ok_count = 0
    local_count = 0
    remote_count = 0
    not_found = 0
    errors = 0
    logger.info("Library scan: artist_images · processing %s artists", total)

    with database.session() as session:
        for artist_id in [a.id for a in todo]:
            if cancel():
                break
            artist = session.get(Artist, artist_id)
            if artist is None:
                continue
            if not fetcher.needs_fetch(artist):
                processed += 1
                continue
            result = fetcher.fetch_one(session, artist, cancel=cancel)
            processed += 1
            if result.ok:
                ok_count += 1
                if result.source == "local":
                    local_count += 1
                else:
                    remote_count += 1
            elif result.status == "error":
                errors += 1
            else:
                not_found += 1
            if processed % 10 == 0 or processed == total:
                session.commit()
                logger.info(
                    "Library scan: artist_images · %s/%s "
                    "(%s ok: %s local, %s remote; %s not_found; %s error)",
                    processed,
                    total,
                    ok_count,
                    local_count,
                    remote_count,
                    not_found,
                    errors,
                )
        session.commit()

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
