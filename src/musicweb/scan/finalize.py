"""End-of-scan missing-file marking and entity recounts."""

from __future__ import annotations

from sqlalchemy import text, update
from sqlalchemy.orm import Session

from musicweb.db.models import Track


def mark_missing(session: Session, seen_paths: set[str]) -> int:
    """Mark present tracks not seen this scan as missing; clear rel_path."""
    if not seen_paths:
        result = session.execute(
            update(Track)
            .where(
                Track.is_missing.is_(False),
                Track.rel_path.is_not(None),
            )
            .values(is_missing=True, rel_path=None)
        )
        return result.rowcount or 0

    # Temp table of seen paths for set difference (scales better than NOT IN list).
    session.execute(
        text("CREATE TEMP TABLE IF NOT EXISTS _seen_paths (p TEXT PRIMARY KEY)")
    )
    session.execute(text("DELETE FROM _seen_paths"))
    session.execute(
        text("INSERT INTO _seen_paths (p) VALUES (:p)"),
        [{"p": p} for p in seen_paths],
    )
    result = session.execute(
        text(
            """
            UPDATE tracks
            SET is_missing = 1, rel_path = NULL
            WHERE is_missing = 0
              AND rel_path IS NOT NULL
              AND rel_path NOT IN (SELECT p FROM _seen_paths)
            """
        )
    )
    session.execute(text("DROP TABLE IF EXISTS _seen_paths"))
    return result.rowcount or 0


def recount_entities(session: Session) -> None:
    session.execute(
        text(
            """
            UPDATE albums SET track_count = (
              SELECT COUNT(*) FROM tracks
              WHERE tracks.album_id = albums.id AND tracks.is_missing = 0
            )
            """
        )
    )
    session.execute(
        text(
            """
            UPDATE albums SET duration_ms = (
              SELECT CASE
                WHEN COUNT(*) = 0 THEN NULL
                WHEN SUM(CASE WHEN tracks.duration_ms IS NULL THEN 1 ELSE 0 END) > 0
                  THEN NULL
                ELSE SUM(tracks.duration_ms)
              END
              FROM tracks
              WHERE tracks.album_id = albums.id AND tracks.is_missing = 0
            )
            """
        )
    )
    session.execute(
        text(
            """
            UPDATE artists SET album_count = (
              SELECT COUNT(*) FROM albums
              WHERE albums.artist_id = artists.id AND albums.track_count > 0
            ),
            track_count = (
              SELECT COUNT(*) FROM tracks
              WHERE tracks.album_artist_id = artists.id AND tracks.is_missing = 0
            )
            """
        )
    )
    session.execute(
        text(
            """
            UPDATE albums SET lossy_kind = (
              SELECT CASE
                WHEN COUNT(*) = 0 THEN NULL
                WHEN COUNT(DISTINCT kind) = 1 THEN MIN(kind)
                ELSE 'mixed'
              END
              FROM (
                SELECT CASE
                  WHEN source_codec IN ('mp3', 'aac') THEN source_codec
                  ELSE 'lossy'
                END AS kind
                FROM tracks
                WHERE tracks.album_id = albums.id
                  AND tracks.is_missing = 0
                  AND tracks.is_lossy = 1
              )
            )
            """
        )
    )
