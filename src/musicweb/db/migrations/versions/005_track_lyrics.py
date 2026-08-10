"""Add track_lyrics table for cached plain/synced lyrics.

Revision ID: 005_track_lyrics
Revises: 004_artist_images
Create Date: 2026-08-10

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_track_lyrics"
down_revision: Union[str, Sequence[str], None] = "004_artist_images"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "track_lyrics",
        sa.Column("track_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column(
            "is_synced",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("plain_text", sa.Text(), nullable=True),
        sa.Column("synced_lrc", sa.Text(), nullable=True),
        sa.Column("provider_id", sa.String(), nullable=True),
        sa.Column("match_fingerprint", sa.String(), nullable=True),
        sa.Column("fetched_at", sa.String(), nullable=True),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["track_id"],
            ["tracks.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("track_id"),
    )


def downgrade() -> None:
    op.drop_table("track_lyrics")
