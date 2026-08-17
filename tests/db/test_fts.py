"""FTS query string and upsert/search on a migrated tmp DB."""

from musicweb.db.fts import (
    fts_query_string,
    fts_rebuild,
    fts_search_track_ids,
    fts_upsert,
)
from musicweb.db.models import Album, Artist, Track


def test_fts_query_string_tokens_and_blank():
    assert fts_query_string("hello world") == "hello* world*"
    assert fts_query_string("hello, world!") == "hello* world*"
    assert fts_query_string("   ") == ""
    assert fts_query_string("") == ""


def _insert_track(session, *, track_id: str, title: str, missing: bool = False) -> None:
    artist = Artist(
        id="art-1",
        name="Artist",
        name_norm="artist",
        sort_name="artist",
        album_count=0,
        track_count=0,
    )
    album = Album(
        id="alb-1",
        artist_id="art-1",
        title="Album",
        title_norm="album",
        track_count=0,
        has_cover=False,
    )
    track = Track(
        id=track_id,
        fingerprint=f"fp-{track_id}",
        fingerprint_algo="sha256",
        rel_path=None if missing else f"{track_id}.flac",
        title=title,
        artist_name="Artist",
        album_artist_name="Artist",
        artist_id="art-1",
        album_id="alb-1",
        album_artist_id="art-1",
        size_bytes=1,
        mtime_ns=1,
        is_missing=missing,
        added_at="t",
        indexed_at="t",
    )
    session.add_all([artist, album, track])
    session.flush()


def test_fts_upsert_and_prefix_search(db):
    with db.session() as session:
        fts_upsert(
            session,
            track_id="t1",
            title="Paranoid Android",
            artist_name="Radiohead",
            album_title="OK Computer",
            album_artist_name="Radiohead",
        )
        session.commit()

    with db.session() as session:
        assert fts_search_track_ids(session, "parano") == ["t1"]
        assert fts_search_track_ids(session, "zzzz") == []
        assert fts_search_track_ids(session, "") == []


def test_fts_rebuild_counts_non_missing_only(db):
    with db.session() as session:
        _insert_track(session, track_id="t1", title="Present")
        session.commit()

    with db.session() as session:
        assert fts_rebuild(session) == 1
        session.commit()

    with db.session() as session:
        row = session.get(Track, "t1")
        assert row is not None
        row.is_missing = True
        row.rel_path = None
        session.commit()

    with db.session() as session:
        assert fts_rebuild(session) == 0
        assert fts_search_track_ids(session, "Present") == []
