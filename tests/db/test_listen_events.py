"""Alembic head no longer has listen_events."""

from __future__ import annotations

from sqlalchemy import inspect


def test_head_has_no_listen_events(db):
    assert inspect(db.engine).has_table("listen_events") is False
