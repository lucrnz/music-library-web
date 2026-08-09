"""FastAPI dependency for request-scoped sessions."""

from __future__ import annotations

from collections.abc import Generator

from fastapi import Request
from sqlalchemy.orm import Session

def get_db(request: Request) -> Generator[Session, None, None]:
    """Yield a session; commit on success, rollback on error."""
    db = request.app.state.database
    session = db.session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
