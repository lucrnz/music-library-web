"""Shared construction of DB, library, stores, and job runner."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from musicweb.artist_image import ArtistImageStore
from musicweb.config import Settings, load_settings
from musicweb.cover import CoverStore
from musicweb.db.engine import Database, init_database
from musicweb.jobs import LibraryJobRunner
from musicweb.library import Library
from musicweb.runtime.lock import is_data_dir_locked


@dataclass
class RuntimeServices:
    settings: Settings
    database: Database
    library: Library
    cover_store: CoverStore
    artist_image_store: ArtistImageStore
    jobs: LibraryJobRunner

    def close(self) -> None:
        self.database.dispose()


def should_migrate_for_cli(data_dir: Path) -> bool:
    """Migrate only when no other process holds the data-dir exclusive lock."""
    return not is_data_dir_locked(data_dir)


def bootstrap_services(
    settings: Settings | None = None,
    *,
    migrate: bool | None = None,
) -> RuntimeServices:
    """
    Build core services without starting HTTP, transcoder, vendor, or jobs.

    *migrate*:
      - True / False: explicit
      - None: True when the data-dir lock is free (CLI default); serve should pass True
    """
    settings = settings or load_settings()
    settings.ensure_data_dir()
    if migrate is None:
        migrate = should_migrate_for_cli(settings.musicweb_data_dir)
    database = init_database(settings.musicweb_data_dir, migrate=migrate)
    library = Library(
        settings.music_library_path,
        index_lossy=settings.index_lossy,
    )
    cover_store = CoverStore(settings.musicweb_data_dir)
    artist_image_store = ArtistImageStore(settings.musicweb_data_dir)
    jobs = LibraryJobRunner(
        database, library, cover_store, artist_image_store, settings
    )
    return RuntimeServices(
        settings=settings,
        database=database,
        library=library,
        cover_store=cover_store,
        artist_image_store=artist_image_store,
        jobs=jobs,
    )
