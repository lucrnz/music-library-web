"""``musicweb stats`` — library counts."""

from __future__ import annotations

import json

from musicweb.db.repositories import albums as albums_repo
from musicweb.db.repositories import artists as artists_repo
from musicweb.db.repositories import tracks as tracks_repo
from musicweb.runtime.bootstrap import bootstrap_services


def stats() -> None:
    """Print artist / album / track counts."""
    rt = bootstrap_services(migrate=None)
    try:
        with rt.database.session() as session:
            payload = {
                "artists": artists_repo.count_with_albums(session),
                "albums": albums_repo.count_with_tracks(session),
                "tracks": tracks_repo.count_present(session),
                "missing_tracks": tracks_repo.count_missing(session),
            }
        print(json.dumps(payload, indent=2, sort_keys=True))
    finally:
        rt.close()
