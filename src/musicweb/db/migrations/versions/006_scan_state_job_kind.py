"""Add kind and force columns to scan_state for multi-kind library jobs.

Revision ID: 006_scan_state_job_kind
Revises: 005_track_lyrics
Create Date: 2026-08-12

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_scan_state_job_kind"
down_revision: Union[str, Sequence[str], None] = "005_track_lyrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("scan_state") as batch:
        batch.add_column(
            sa.Column(
                "kind",
                sa.String(),
                nullable=False,
                server_default="scan",
            )
        )
        batch.add_column(sa.Column("force", sa.Boolean(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("scan_state") as batch:
        batch.drop_column("force")
        batch.drop_column("kind")
