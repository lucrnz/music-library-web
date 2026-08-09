"""Initial library schema + FTS5.

Revision ID: 001_initial
Revises:
Create Date: 2026-08-09

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "artists",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("name_norm", sa.String(), nullable=False),
        sa.Column("sort_name", sa.String(), nullable=False),
        sa.Column("album_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("track_count", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name_norm"),
    )
    op.create_index("ix_artists_name_norm", "artists", ["name_norm"])
    op.create_index("ix_artists_sort_name", "artists", ["sort_name"])

    op.create_table(
        "albums",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("artist_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("title_norm", sa.String(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("track_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("has_cover", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("artist_id", "title_norm", name="uq_album_artist_title"),
    )
    op.create_index("ix_albums_artist_id", "albums", ["artist_id"])

    op.create_table(
        "tracks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("fingerprint", sa.String(), nullable=False),
        sa.Column("fingerprint_algo", sa.String(), nullable=False),
        sa.Column("rel_path", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("artist_name", sa.String(), nullable=False),
        sa.Column("album_artist_name", sa.String(), nullable=False),
        sa.Column("artist_id", sa.String(length=36), nullable=True),
        sa.Column("album_id", sa.String(length=36), nullable=True),
        sa.Column("album_artist_id", sa.String(length=36), nullable=True),
        sa.Column("track_no", sa.Integer(), nullable=True),
        sa.Column("disc_no", sa.Integer(), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("mtime_ns", sa.BigInteger(), nullable=False),
        sa.Column("is_missing", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("added_at", sa.String(), nullable=False),
        sa.Column("indexed_at", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"]),
        sa.ForeignKeyConstraint(["album_artist_id"], ["artists.id"]),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fingerprint"),
        sa.UniqueConstraint("rel_path"),
    )
    op.create_index("ix_tracks_album_id", "tracks", ["album_id"])
    op.create_index("ix_tracks_artist_id", "tracks", ["artist_id"])
    op.create_index("ix_tracks_album_artist_id", "tracks", ["album_artist_id"])
    op.create_index("ix_tracks_is_missing", "tracks", ["is_missing"])

    op.create_table(
        "playlists",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "playlist_tracks",
        sa.Column("playlist_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["playlist_id"], ["playlists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"]),
        sa.PrimaryKeyConstraint("playlist_id", "position"),
    )
    op.create_index("ix_playlist_tracks_track_id", "playlist_tracks", ["track_id"])

    op.create_table(
        "scan_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=True),
        sa.Column("started_at", sa.String(), nullable=True),
        sa.Column("finished_at", sa.String(), nullable=True),
        sa.Column("phase", sa.String(), nullable=True),
        sa.Column("files_seen", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("files_upserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("files_missing", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("files_total_hint", sa.Integer(), nullable=True),
        sa.Column("current_path", sa.Text(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # FTS5 virtual table (not reflected by ORM / autogenerate)
    op.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
          track_id UNINDEXED,
          title,
          artist_name,
          album_title,
          album_artist_name,
          tokenize = 'unicode61'
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tracks_fts")
    op.drop_table("scan_state")
    op.drop_index("ix_playlist_tracks_track_id", table_name="playlist_tracks")
    op.drop_table("playlist_tracks")
    op.drop_table("playlists")
    op.drop_index("ix_tracks_is_missing", table_name="tracks")
    op.drop_index("ix_tracks_album_artist_id", table_name="tracks")
    op.drop_index("ix_tracks_artist_id", table_name="tracks")
    op.drop_index("ix_tracks_album_id", table_name="tracks")
    op.drop_table("tracks")
    op.drop_index("ix_albums_artist_id", table_name="albums")
    op.drop_table("albums")
    op.drop_index("ix_artists_sort_name", table_name="artists")
    op.drop_index("ix_artists_name_norm", table_name="artists")
    op.drop_table("artists")
