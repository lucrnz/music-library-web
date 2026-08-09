"""FastAPI dependency for request-scoped sessions."""

from __future__ import annotations

from collections.abc import Generator

from fastapi import Request
from sqlalchemy.orm import Session

from musicweb.db.engine import Database


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_db(request: Request) -> Generator[Session, None, None]:
    """Yield a session; commit on success, rollback on error."""
    db: Database = request.app.state.database
    session = db.session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
