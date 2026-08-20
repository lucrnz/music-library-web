"""Household radio station clock, queue, and banlist.

Revision ID: 011_radio_station
Revises: 010_listen_events
Create Date: 2026-08-20

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_radio_station"
down_revision: Union[str, Sequence[str], None] = "010_listen_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "radio_station",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("current_track_id", sa.String(length=36), nullable=True),
        sa.Column("track_started_at", sa.String(), nullable=True),
        sa.Column("current_batch_seq", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "radio_queue",
        sa.Column("batch_seq", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.String(length=36), nullable=False),
        sa.PrimaryKeyConstraint("batch_seq", "position"),
    )
    op.create_table(
        "radio_banlist",
        sa.Column("batch_seq", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.String(length=36), nullable=False),
        sa.PrimaryKeyConstraint("batch_seq", "position"),
    )


def downgrade() -> None:
    op.drop_table("radio_banlist")
    op.drop_table("radio_queue")
    op.drop_table("radio_station")
