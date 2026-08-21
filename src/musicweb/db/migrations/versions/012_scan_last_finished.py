"""Scan watermark for radio, independent of the last job kind.

Revision ID: 012_scan_last_finished
Revises: 011_radio_station
Create Date: 2026-08-21

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012_scan_last_finished"
down_revision: Union[str, Sequence[str], None] = "011_radio_station"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("scan_state") as batch:
        batch.add_column(
            sa.Column("last_scan_finished_at", sa.String(), nullable=True)
        )
    op.execute(
        sa.text(
            "UPDATE scan_state SET last_scan_finished_at = finished_at "
            "WHERE kind = 'scan' AND finished_at IS NOT NULL"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("scan_state") as batch:
        batch.drop_column("last_scan_finished_at")
