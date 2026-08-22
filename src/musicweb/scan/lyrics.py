"""Lyrics fetch phase for the library scanner."""

from __future__ import annotations

import logging
from collections.abc import Callable

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from musicweb.db.engine import Database
from musicweb.db.models import Album, Track, TrackLyrics
from musicweb.library import Library
from musicweb.lyrics import LyricsFetcher
from musicweb.lyrics.fetch import match_fingerprint, sidecar_lrc_exists
from musicweb.scan.enrichment import iter_enrichment

logger = logging.getLogger(__name__)

# Non-success statuses that always need another resolve attempt (subject to
# needs_fetch cooldown / force rules).
_NON_OK_STATUSES = ("not_found", "error", "pending", "skipped")

def _ordered_unique(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for track_id in ids:
        if track_id not in seen:
            seen.add(track_id)
            out.append(track_id)
    return out


def _pass1_remote_miss_ids(session: Session) -> list[str]:
    """
    SQL candidates: present tracks with no lyrics row or a non-success status.

    Does not load full Track ORM graphs or lyrics text.
    """
    return list(
        session.scalars(
            select(Track.id)
            .outerjoin(TrackLyrics, TrackLyrics.track_id == Track.id)
            .where(Track.is_missing.is_(False))
            .where(
                or_(
                    TrackLyrics.track_id.is_(None),
                    TrackLyrics.status.in_(_NON_OK_STATUSES),
                )
            )
            .order_by(Track.indexed_at.desc())
        ).all()
    )


def _pass1b_fingerprint_mismatch_ids(session: Session) -> list[str]:
    """
    ok/instrumental rows whose stored match_fingerprint is stale.

    Lightweight column projection only (no lyrics body, no full entity graph).
    """
    rows = session.execute(
        select(
            Track.id,
            Track.title,
            Track.artist_name,
            Track.duration_ms,
            Album.title,
            TrackLyrics.match_fingerprint,
        )
        .join(TrackLyrics, TrackLyrics.track_id == Track.id)
        .outerjoin(Album, Album.id == Track.album_id)
        .where(Track.is_missing.is_(False))
        .where(TrackLyrics.status.in_(("ok", "instrumental")))
    ).all()

    out: list[str] = []
    for (
        track_id,
        title,
        artist_name,
        duration_ms,
        album_title,
        stored_fp,
    ) in rows:
        current = match_fingerprint(
            title=title,
            artist_name=artist_name,
            album_title=album_title,
            duration_ms=duration_ms,
        )
        if not stored_fp or stored_fp != current:
            out.append(track_id)
    return out


def _pass2_sidecar_ids(session: Session, library: Library) -> list[str]:
    """
    Present tracks with a ``.lrc`` sidecar that is not already stored as local_lrc.

    O(n) path stats only — no HTTP, no lyrics body load.
    """
    rows = session.execute(
        select(Track.id, Track.rel_path, TrackLyrics.source)
        .outerjoin(TrackLyrics, TrackLyrics.track_id == Track.id)
        .where(Track.is_missing.is_(False))
        .where(Track.rel_path.is_not(None))
    ).all()

    out: list[str] = []
    for track_id, rel_path, source in rows:
        if source == "local_lrc":
            continue
        abs_path = library.present_audio(rel_path)
        if abs_path is None:
            continue
        if sidecar_lrc_exists(abs_path):
            out.append(track_id)
    return out


def _collect_todo_ids(
    session: Session,
    library: Library,
) -> list[str]:
    """
    Build candidate track ids without materializing every Track + lyrics graph.

    pass1  — missing row / non-ok status (SQL)
    pass1b — fingerprint mismatch on success rows (lightweight columns)
    pass2  — sidecar .lrc upgrade (path stats)
    """
    ids: list[str] = []
    ids.extend(_pass1_remote_miss_ids(session))
    ids.extend(_pass1b_fingerprint_mismatch_ids(session))
    ids.extend(_pass2_sidecar_ids(session, library))
    return _ordered_unique(ids)


def fetch_track_lyrics(
    database: Database,
    fetcher: LyricsFetcher,
    library: Library,
    *,
    cancel: Callable[[], bool],
    force: bool = False,
) -> None:
    """
    Resolve missing lyrics (local then LRCLIB).

    *force* (full scan) is passed into ``needs_fetch`` so miss/error rows can
    break retry cooldown. Stable ok/instrumental rows are not re-fetched
    remotely; a present ``.lrc`` sidecar re-queues when not already local_lrc.

    Candidate selection is SQL-narrowed (see ``_collect_todo_ids``); ``needs_fetch``
    remains the final gate for cooldown / force edge cases.

    Commit cadence and cancel checks match the artist_images phase.
    Logs greppable ``Library scan: lyrics · …`` lines.
    """
    with database.session() as session:
        todo_ids = _collect_todo_ids(session, library)

    if not todo_ids:
        logger.info("Library scan: lyrics · nothing to do")
        return

    ok_count = 0
    local_count = 0
    remote_count = 0
    instrumental = 0
    not_found = 0
    errors = 0

    def load(session: Session, track_id: str) -> Track | None:
        return session.scalars(
            select(Track)
            .where(Track.id == track_id)
            .options(selectinload(Track.album), selectinload(Track.lyrics))
        ).first()

    def needs(track: Track) -> bool:
        if track.is_missing:
            return False
        abs_path = library.present_audio(track.rel_path)
        return fetcher.needs_fetch(
            track, track.lyrics, force=force, abs_path=abs_path
        )

    def fetch(session: Session, track: Track):
        abs_path = library.present_audio(track.rel_path)
        return fetcher.fetch_one(session, track, abs_path, cancel=cancel)

    def on_result(result: object) -> None:
        nonlocal ok_count, local_count, remote_count, instrumental, not_found, errors
        status = getattr(result, "status", None)
        if getattr(result, "ok", False) and status == "ok":
            ok_count += 1
            source = getattr(result, "source", None) or ""
            if str(source).startswith("local"):
                local_count += 1
            else:
                remote_count += 1
        elif status == "instrumental":
            instrumental += 1
        elif status == "error":
            errors += 1
        else:
            not_found += 1

    processed = iter_enrichment(
        database,
        todo_ids,
        load=load,
        needs=needs,
        fetch=fetch,
        log_prefix="lyrics",
        cancel=cancel,
        on_result=on_result,
    )

    if processed == 0:
        logger.info("Library scan: lyrics · nothing to do")
    else:
        logger.info(
            "Library scan: lyrics · done %s "
            "(%s ok: %s local, %s remote; %s instrumental; %s not_found; %s error)",
            processed,
            ok_count,
            local_count,
            remote_count,
            instrumental,
            not_found,
            errors,
        )
