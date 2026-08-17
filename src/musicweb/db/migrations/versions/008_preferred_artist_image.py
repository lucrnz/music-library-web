"""Add preferred artist image flag and cache-bust revision.

Revision ID: 008_preferred_artist_image
Revises: 007_track_lossy_and_album_kind
Create Date: 2026-08-17

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_preferred_artist_image"
down_revision: Union[str, Sequence[str], None] = "007_track_lossy_and_album_kind"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Plain ADD COLUMN avoids SQLite batch-table rebuild (FK references artists).
    op.add_column(
        "artists",
        sa.Column(
            "has_preferred_image",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "artists",
        sa.Column(
            "preferred_rev",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    # batch_alter would DROP artists; use raw DROP COLUMN (SQLite 3.35+).
    with op.batch_alter_table("artists", recreate="always") as batch:
        batch.drop_column("preferred_rev")
        batch.drop_column("has_preferred_image")
