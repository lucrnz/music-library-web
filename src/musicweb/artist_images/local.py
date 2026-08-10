"""Local artist.jpg / artist.png discovery under the library tree."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from musicweb.db.models import Track
from musicweb.library import Library

_LOCAL_NAME_SET = {n.casefold() for n in ("artist.jpg", "artist.jpeg", "artist.png")}


def find_local_artist_file(start_dir: Path, library_root: Path) -> Path | None:
    """Walk up from start_dir toward library root looking for artist.jpg/png only."""
    try:
        current = start_dir.resolve()
        root = library_root.resolve()
    except OSError:
        return None

    for _ in range(8):
        try:
            if not current.is_dir():
                current = current.parent
                continue
        except OSError:
            break

        for name in ("artist.jpg", "artist.jpeg", "artist.png"):
            candidate = current / name
            try:
                if candidate.is_file() and candidate.stat().st_size > 0:
                    return candidate
            except OSError:
                pass

        try:
            for entry in current.iterdir():
                if not entry.is_file():
                    continue
                if entry.name.casefold() in _LOCAL_NAME_SET:
                    try:
                        if entry.stat().st_size > 0:
                            return entry
                    except OSError:
                        continue
        except OSError:
            pass

        if current == root:
            break
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def sample_audio_dir(
    session: Session, library: Library, artist_id: str
) -> Path | None:
    track = session.execute(
        select(Track)
        .where(
            Track.album_artist_id == artist_id,
            Track.is_missing.is_(False),
            Track.rel_path.is_not(None),
        )
        .limit(1)
    ).scalar_one_or_none()
    if track is None:
        track = session.execute(
            select(Track)
            .where(
                Track.artist_id == artist_id,
                Track.is_missing.is_(False),
                Track.rel_path.is_not(None),
            )
            .limit(1)
        ).scalar_one_or_none()
    if track is None or not track.rel_path:
        return None
    try:
        path = library.resolve(track.rel_path)
        if path.is_file():
            return path.parent
    except Exception:
        return None
    return None
