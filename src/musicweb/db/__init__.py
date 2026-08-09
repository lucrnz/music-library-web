"""SQLAlchemy database package: engine, models, FTS, repositories, migrations."""

from musicweb.db.engine import Database, init_database
from musicweb.db.models import (
    Album,
    Artist,
    Playlist,
    PlaylistTrack,
    ScanState,
    Track,
)

__all__ = [
    "Album",
    "Artist",
    "Database",
    "Playlist",
    "PlaylistTrack",
    "ScanState",
    "Track",
    "init_database",
]
