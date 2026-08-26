"""Add albums.duration_ms and backfill from present tracks.

Revision ID: 014_album_duration
Revises: 013_listen_origin
Create Date: 2026-08-26

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014_album_duration"
down_revision: Union[str, Sequence[str], None] = "013_listen_origin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BACKFILL = """
UPDATE albums SET duration_ms = (
  SELECT CASE
    WHEN COUNT(*) = 0 THEN NULL
    WHEN SUM(CASE WHEN tracks.duration_ms IS NULL THEN 1 ELSE 0 END) > 0
      THEN NULL
    ELSE SUM(tracks.duration_ms)
  END
  FROM tracks
  WHERE tracks.album_id = albums.id AND tracks.is_missing = 0
)
"""


def upgrade() -> None:
    with op.batch_alter_table("albums") as batch:
        batch.add_column(sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.execute(_BACKFILL)


def downgrade() -> None:
    with op.batch_alter_table("albums") as batch:
        batch.drop_column("duration_ms")
