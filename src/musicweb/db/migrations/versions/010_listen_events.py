"""Add listen_events for household playback stats.

Revision ID: 010_listen_events
Revises: 009_track_bitrate_mode
Create Date: 2026-08-20

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_listen_events"
down_revision: Union[str, Sequence[str], None] = "009_track_bitrate_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "listen_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("track_id", sa.String(length=36), nullable=False),
        sa.Column("profile_tag", sa.String(), nullable=False),
        sa.Column("play_source", sa.String(), nullable=False),
        sa.Column("counted_at", sa.String(), nullable=False),
        sa.Column("month_key", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_listen_events_track_id", "listen_events", ["track_id"])
    op.create_index("ix_listen_events_counted_at", "listen_events", ["counted_at"])
    op.create_index("ix_listen_events_month_key", "listen_events", ["month_key"])
    op.create_index(
        "ix_listen_events_track_id_counted_at",
        "listen_events",
        ["track_id", "counted_at"],
    )


def downgrade() -> None:
    op.drop_table("listen_events")
