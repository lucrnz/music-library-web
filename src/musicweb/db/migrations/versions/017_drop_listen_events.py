"""Drop listen_events household playback log.

Revision ID: 017_drop_listen_events
Revises: 016_cd_unripped
Create Date: 2026-08-31

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "017_drop_listen_events"
down_revision: Union[str, Sequence[str], None] = "016_cd_unripped"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("listen_events")


def downgrade() -> None:
    op.create_table(
        "listen_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("track_id", sa.String(length=36), nullable=False),
        sa.Column("profile_tag", sa.String(), nullable=False),
        sa.Column("play_source", sa.String(), nullable=False),
        sa.Column(
            "origin",
            sa.String(),
            nullable=False,
            server_default="queue",
        ),
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
