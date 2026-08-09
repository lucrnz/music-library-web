"""FTS5 helpers for track search (not mapped as ORM models)."""

from __future__ import annotations

import logging
import re

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

FTS_DDL = """
CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  track_id UNINDEXED,
  title,
  artist_name,
  album_title,
  album_artist_name,
  tokenize = 'unicode61'
)
"""

_FTS_SPECIAL = re.compile(r"[^\w\s]", re.UNICODE)


def ensure_fts(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(FTS_DDL))


def fts_upsert(
    session: Session,
    *,
    track_id: str,
    title: str,
    artist_name: str,
    album_title: str,
    album_artist_name: str,
) -> None:
    session.execute(
        text("DELETE FROM tracks_fts WHERE track_id = :tid"),
        {"tid": track_id},
    )
    session.execute(
        text(
            """
            INSERT INTO tracks_fts
              (track_id, title, artist_name, album_title, album_artist_name)
            VALUES
              (:track_id, :title, :artist_name, :album_title, :album_artist_name)
            """
        ),
        {
            "track_id": track_id,
            "title": title or "",
            "artist_name": artist_name or "",
            "album_title": album_title or "",
            "album_artist_name": album_artist_name or "",
        },
    )


def fts_delete(session: Session, track_id: str) -> None:
    session.execute(
        text("DELETE FROM tracks_fts WHERE track_id = :tid"),
        {"tid": track_id},
    )


def fts_clear(session: Session) -> None:
    session.execute(text("DELETE FROM tracks_fts"))


def fts_rebuild(session: Session) -> int:
    """Rebuild FTS from non-missing tracks via SQL (no ORM load)."""
    fts_clear(session)
    result = session.execute(
        text(
            """
            INSERT INTO tracks_fts
              (track_id, title, artist_name, album_title, album_artist_name)
            SELECT
              t.id,
              t.title,
              t.artist_name,
              COALESCE(a.title, ''),
              t.album_artist_name
            FROM tracks t
            LEFT JOIN albums a ON a.id = t.album_id
            WHERE t.is_missing = 0
            """
        )
    )
    return result.rowcount or 0


def fts_query_string(user_query: str) -> str:
    """Turn a user query into an FTS5 prefix query over tokens."""
    cleaned = _FTS_SPECIAL.sub(" ", user_query).strip()
    if not cleaned:
        return ""
    tokens = [t for t in cleaned.split() if t]
    if not tokens:
        return ""
    return " ".join(f"{t}*" for t in tokens)


def fts_search_track_ids(session: Session, query: str, limit: int = 50) -> list[str]:
    match = fts_query_string(query)
    if not match:
        return []
    try:
        rows = session.execute(
            text(
                """
                SELECT track_id FROM tracks_fts
                WHERE tracks_fts MATCH :q
                ORDER BY rank
                LIMIT :lim
                """
            ),
            {"q": match, "lim": limit},
        ).all()
    except Exception as exc:
        logger.debug("FTS search failed for %r: %s", query, exc)
        return []
    return [r[0] for r in rows]
