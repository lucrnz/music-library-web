"""Add tracks.bitrate_mode for lossy CBR/VBR/ABR.

Revision ID: 009_track_bitrate_mode
Revises: 008_preferred_artist_image
Create Date: 2026-08-18

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_track_bitrate_mode"
down_revision: Union[str, Sequence[str], None] = "008_preferred_artist_image"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tracks", sa.Column("bitrate_mode", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("tracks", "bitrate_mode")
