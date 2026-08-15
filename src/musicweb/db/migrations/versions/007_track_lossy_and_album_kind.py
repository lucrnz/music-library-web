"""Add lossy flags on tracks and album roll-up kind.

Revision ID: 007_track_lossy_and_album_kind
Revises: 006_scan_state_job_kind
Create Date: 2026-08-15

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_track_lossy_and_album_kind"
down_revision: Union[str, Sequence[str], None] = "006_scan_state_job_kind"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tracks") as batch:
        batch.add_column(
            sa.Column(
                "is_lossy",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(sa.Column("bitrate_kbps", sa.Integer(), nullable=True))
    with op.batch_alter_table("albums") as batch:
        batch.add_column(sa.Column("lossy_kind", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("albums") as batch:
        batch.drop_column("lossy_kind")
    with op.batch_alter_table("tracks") as batch:
        batch.drop_column("bitrate_kbps")
        batch.drop_column("is_lossy")
