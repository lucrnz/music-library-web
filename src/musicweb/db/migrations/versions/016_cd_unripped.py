"""Unripped flag, cd_identities snapshot, drop hidden cd-discid rows.

Revision ID: 016_cd_unripped
Revises: 015_cd_identity
Create Date: 2026-08-29

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016_cd_unripped"
down_revision: Union[str, Sequence[str], None] = "015_cd_identity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tracks") as batch:
        batch.add_column(
            sa.Column(
                "unripped",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
    with op.batch_alter_table("cd_identities") as batch:
        batch.add_column(sa.Column("album_id", sa.String(), nullable=True))
        batch.add_column(sa.Column("album", sa.String(), nullable=True))
        batch.add_column(sa.Column("artist", sa.String(), nullable=True))
        batch.add_column(sa.Column("year", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column(
                "has_cover",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(sa.Column("tracks_json", sa.Text(), nullable=True))
    op.execute(
        """
        DELETE FROM playlist_tracks
        WHERE track_id IN (
          SELECT id FROM tracks WHERE fingerprint_algo = 'cd-discid'
        )
        """
    )
    op.execute("DELETE FROM tracks WHERE fingerprint_algo = 'cd-discid'")
    op.execute(
        """
        DELETE FROM albums
        WHERE id NOT IN (
          SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL
        )
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("cd_identities") as batch:
        batch.drop_column("tracks_json")
        batch.drop_column("has_cover")
        batch.drop_column("year")
        batch.drop_column("artist")
        batch.drop_column("album")
        batch.drop_column("album_id")
    with op.batch_alter_table("tracks") as batch:
        batch.drop_column("unripped")
