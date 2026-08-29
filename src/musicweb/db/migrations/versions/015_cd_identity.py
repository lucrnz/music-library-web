"""Remember confirmed MusicBrainz disc identities.

Revision ID: 015_cd_identity
Revises: 014_album_duration
Create Date: 2026-08-29

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015_cd_identity"
down_revision: Union[str, Sequence[str], None] = "014_album_duration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cd_identities",
        sa.Column("discid", sa.String(), primary_key=True),
        sa.Column("release_mbid", sa.String(), nullable=False),
        sa.Column("toc_json", sa.Text(), nullable=False),
        sa.Column("confirmed_at", sa.String(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("cd_identities")
