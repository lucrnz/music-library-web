"""Library scan / regen jobs. The runner only dispatches and owns ScanState."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from musicweb.artist_images import ArtistImageFetcher
from musicweb.cover import CoverStore
from musicweb.db.engine import Database
from musicweb.db.fts import fts_rebuild
from musicweb.library import Library
from musicweb.lyrics import LyricsFetcher
from musicweb.scan.artist_images import fetch_artist_images
from musicweb.scan.batch import ScanMode
from musicweb.scan.covers import album_cover_sources, extract_covers
from musicweb.scan.finalize import mark_missing, recount_entities
from musicweb.scan.index_phase import run_index
from musicweb.scan.lyrics import fetch_track_lyrics
from musicweb.scan.va_remount import remount_va

CancelFn = Callable[[], bool]
ProgressFn = Callable[..., None]
BeginPhase = Callable[[str], None]
SetCounts = Callable[[int, int, int], None]


def _finalize(
    database: Database,
    mode: ScanMode,
    *,
    seen_paths: set[str],
    covers: CoverStore,
) -> int:
    with database.session() as session:
        missing = mark_missing(session, seen_paths)
        remount_va(session, covers)
        recount_entities(session)
        if mode == "full":
            fts_rebuild(session)
        session.commit()
        return missing


def _run_covers(
    database: Database,
    library: Library,
    covers: CoverStore,
    cover_queue: dict[str, Path],
    *,
    force: bool,
    cancel: CancelFn,
    collect_sources: bool,
) -> None:
    with database.session() as session:
        queue = cover_queue
        if collect_sources:
            queue = album_cover_sources(session, library)
        if not queue:
            return
        extract_covers(
            session,
            covers,
            queue,
            force=force,
            cancel=cancel,
        )


def run_scan(
    database: Database,
    library: Library,
    covers: CoverStore,
    artist_fetcher: ArtistImageFetcher,
    lyrics_fetcher: LyricsFetcher,
    *,
    mode: ScanMode,
    force: bool,
    cancel: CancelFn,
    on_progress: ProgressFn,
    begin_phase: BeginPhase,
    set_counts: SetCounts,
) -> None:
    if cancel():
        return
    begin_phase("index")
    result = run_index(
        database,
        library,
        mode,
        cancel=cancel,
        on_progress=lambda **kwargs: on_progress(phase="index", **kwargs),
    )
    if cancel():
        return
    begin_phase("finalize")
    missing = _finalize(
        database, mode, seen_paths=result.seen_paths, covers=covers
    )
    set_counts(result.seen_count, result.upserted, missing)
    on_progress(
        phase="finalize",
        files_seen=result.seen_count,
        files_upserted=result.upserted,
        files_missing=missing,
    )
    if cancel():
        return
    begin_phase("covers")
    _run_covers(
        database,
        library,
        covers,
        result.cover_queue,
        force=force,
        cancel=cancel,
        collect_sources=False,
    )
    if cancel():
        return
    begin_phase("artist_images")
    fetch_artist_images(database, artist_fetcher, cancel=cancel, force=force)
    if cancel():
        return
    begin_phase("lyrics")
    fetch_track_lyrics(
        database, lyrics_fetcher, library, cancel=cancel, force=force
    )


def regen_covers(
    database: Database,
    library: Library,
    covers: CoverStore,
    *,
    force: bool,
    cancel: CancelFn,
    begin_phase: BeginPhase,
) -> None:
    if cancel():
        return
    begin_phase("covers")
    _run_covers(
        database,
        library,
        covers,
        {},
        force=force,
        cancel=cancel,
        collect_sources=True,
    )


def regen_artist_images(
    database: Database,
    artist_fetcher: ArtistImageFetcher,
    *,
    force: bool,
    cancel: CancelFn,
    begin_phase: BeginPhase,
) -> None:
    if cancel():
        return
    begin_phase("artist_images")
    fetch_artist_images(database, artist_fetcher, cancel=cancel, force=force)


def regen_lyrics(
    database: Database,
    lyrics_fetcher: LyricsFetcher,
    library: Library,
    *,
    force: bool,
    cancel: CancelFn,
    begin_phase: BeginPhase,
) -> None:
    if cancel():
        return
    begin_phase("lyrics")
    fetch_track_lyrics(
        database, lyrics_fetcher, library, cancel=cancel, force=force
    )
