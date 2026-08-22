"""Add origin (queue | radio) on listen_events.

Revision ID: 013_listen_origin
Revises: 012_scan_last_finished
Create Date: 2026-08-22

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_listen_origin"
down_revision: Union[str, Sequence[str], None] = "012_scan_last_finished"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("listen_events") as batch:
        batch.add_column(
            sa.Column(
                "origin",
                sa.String(),
                nullable=False,
                server_default="queue",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("listen_events") as batch:
        batch.drop_column("origin")
