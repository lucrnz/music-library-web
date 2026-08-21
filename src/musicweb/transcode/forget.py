"""Resolve track ids to stream-cache paths for ``Transcoder.forget_paths``."""

from __future__ import annotations

from collections.abc import Set as AbstractSet

from sqlalchemy.orm import Session

from musicweb.db.repositories import tracks as tracks_repo


def resolve_forget(
    session: Session,
    ids: list[str],
    retained: AbstractSet[str],
) -> tuple[list[str], int, int]:
    """Map requested ids to ``rel_path``s that should be forgotten.

    Returns ``(paths, forgotten, skipped)``. Counts are over unique ids.
    Retained, unknown, missing, lossy, and pathless ids are skipped.
    """
    unique = list(dict.fromkeys(i for i in ids if i))
    if not unique:
        return [], 0, 0
    candidates = [tid for tid in unique if tid not in retained]
    skipped = len(unique) - len(candidates)
    if not candidates:
        return [], 0, skipped
    found = {track.id: track for track in tracks_repo.get_many(session, candidates)}
    paths: list[str] = []
    forgotten = 0
    for tid in candidates:
        track = found.get(tid)
        if (
            track is None
            or track.is_missing
            or not track.rel_path
            or track.is_lossy
        ):
            skipped += 1
            continue
        paths.append(track.rel_path)
        forgotten += 1
    return paths, forgotten, skipped
