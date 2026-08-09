"""Nullable rel_path for missing tracks; clear .missing/ tombstones.

Revision ID: 002_nullable_paths
Revises: 001_initial
Create Date: 2026-08-09

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_nullable_paths"
down_revision: Union[str, Sequence[str], None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tracks") as batch:
        batch.alter_column(
            "rel_path",
            existing_type=sa.String(),
            nullable=True,
        )

    # Backfill path tombstones → null + missing
    op.execute(
        """
        UPDATE tracks
        SET is_missing = 1,
            rel_path = NULL
        WHERE rel_path LIKE '.missing/%'
        """
    )
    op.execute(
        """
        UPDATE tracks
        SET rel_path = NULL
        WHERE is_missing = 1 AND rel_path IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE tracks
        SET rel_path = '.missing/' || id
        WHERE rel_path IS NULL
        """
    )
    with op.batch_alter_table("tracks") as batch:
        batch.alter_column(
            "rel_path",
            existing_type=sa.String(),
            nullable=False,
        )
