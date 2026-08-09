"""Add source audio tech columns on tracks.

Revision ID: 003_track_audio_tech
Revises: 002_nullable_paths
Create Date: 2026-08-09

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_track_audio_tech"
down_revision: Union[str, Sequence[str], None] = "002_nullable_paths"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tracks") as batch:
        batch.add_column(sa.Column("sample_rate_hz", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("bit_depth", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("channels", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("source_codec", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tracks") as batch:
        batch.drop_column("source_codec")
        batch.drop_column("channels")
        batch.drop_column("bit_depth")
        batch.drop_column("sample_rate_hz")
