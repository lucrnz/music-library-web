"""Add artist profile image metadata columns.

Revision ID: 004_artist_images
Revises: 003_track_audio_tech
Create Date: 2026-08-09

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_artist_images"
down_revision: Union[str, Sequence[str], None] = "003_track_audio_tech"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Plain ADD COLUMN avoids SQLite batch-table rebuild (FK references artists).
    op.add_column(
        "artists",
        sa.Column("has_image", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("artists", sa.Column("mbid", sa.String(), nullable=True))
    op.add_column("artists", sa.Column("image_source", sa.String(), nullable=True))
    op.add_column("artists", sa.Column("image_status", sa.String(), nullable=True))
    op.add_column("artists", sa.Column("image_fetched_at", sa.String(), nullable=True))


def downgrade() -> None:
    # batch_alter would DROP artists; use raw DROP COLUMN (SQLite 3.35+).
    with op.batch_alter_table("artists", recreate="always") as batch:
        batch.drop_column("image_fetched_at")
        batch.drop_column("image_status")
        batch.drop_column("image_source")
        batch.drop_column("mbid")
        batch.drop_column("has_image")
