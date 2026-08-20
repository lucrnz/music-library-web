"""Listen-event insert, month keys, and ranking queries."""

from __future__ import annotations

from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError

from musicweb.db.models import Album, Artist, ListenEvent, Track
from musicweb.db.repositories import listens as listens_repo
from musicweb.timeutil import utc_now_iso


def _insert_artist(session, *, artist_id: str, name: str) -> Artist:
    artist = Artist(
        id=artist_id,
        name=name,
        name_norm=name.lower(),
        sort_name=name.lower(),
        album_count=1,
        track_count=1,
    )
    session.add(artist)
    return artist


def _insert_album(session, *, album_id: str, artist_id: str, title: str) -> Album:
    album = Album(
        id=album_id,
        artist_id=artist_id,
        title=title,
        title_norm=title.lower(),
        track_count=1,
        has_cover=False,
    )
    session.add(album)
    return album


def _insert_track(
    session,
    *,
    track_id: str,
    title: str,
    artist_id: str | None,
    album_id: str | None,
    missing: bool = False,
) -> Track:
    track = Track(
        id=track_id,
        fingerprint=f"fp-{track_id}",
        fingerprint_algo="sha256",
        rel_path=None if missing else f"{track_id}.flac",
        title=title,
        artist_name="Artist",
        album_artist_name="Artist",
        artist_id=artist_id,
        album_id=album_id,
        album_artist_id=artist_id,
        size_bytes=1,
        mtime_ns=1,
        is_missing=missing,
        added_at="t",
        indexed_at="t",
    )
    session.add(track)
    return track


def _seed_library(session) -> None:
    _insert_artist(session, artist_id="art-1", name="Alpha")
    _insert_artist(session, artist_id="art-2", name="Beta")
    _insert_album(session, album_id="alb-1", artist_id="art-1", title="First")
    _insert_album(session, album_id="alb-2", artist_id="art-2", title="Second")
    _insert_track(
        session, track_id="t1", title="One", artist_id="art-1", album_id="alb-1"
    )
    _insert_track(
        session, track_id="t2", title="Two", artist_id="art-2", album_id="alb-2"
    )
    _insert_track(
        session, track_id="t3", title="Orphan", artist_id=None, album_id=None
    )
    _insert_track(
        session,
        track_id="t-missing",
        title="Gone",
        artist_id="art-1",
        album_id="alb-1",
        missing=True,
    )
    session.flush()


def test_head_includes_listen_events(db):
    insp = inspect(db.engine)
    assert insp.has_table("listen_events")
    names = {c["name"] for c in insp.get_columns("listen_events")}
    assert names == {
        "id",
        "track_id",
        "profile_tag",
        "play_source",
        "counted_at",
        "month_key",
    }


def test_insert_then_duplicate_is_lookup(db):
    with db.session() as session:
        _seed_library(session)
        first = listens_repo.insert_listen(
            session,
            id="e1",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-20T12:00:00+00:00",
        )
        second = listens_repo.insert_listen(
            session,
            id="e1",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-21T12:00:00+00:00",
        )
        session.commit()
        assert first == "inserted"
        assert second == "duplicate"
        assert session.scalar(select(ListenEvent.id)) == "e1"
        assert session.scalars(select(ListenEvent)).all()[0].counted_at.endswith(
            "12:00:00+00:00"
        )


def test_mixed_counted_at_formats_store_utc_now_iso_shape(db):
    with db.session() as session:
        _seed_library(session)
        sample = utc_now_iso()
        listens_repo.insert_listen(
            session,
            id="e-z",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-01-02T03:04:05.123456Z",
        )
        listens_repo.insert_listen(
            session,
            id="e-offset",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-01-02T04:04:05+00:00",
        )
        listens_repo.insert_listen(
            session,
            id="e-us",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-01-02T05:04:05.999999+00:00",
        )
        session.commit()
        stored = {
            row.id: row.counted_at
            for row in session.scalars(select(ListenEvent)).all()
        }
        assert stored["e-z"] == "2026-01-02T03:04:05+00:00"
        assert stored["e-offset"] == "2026-01-02T04:04:05+00:00"
        assert stored["e-us"] == "2026-01-02T05:04:05+00:00"
        assert all(len(value) == len(sample) for value in stored.values())
        ranks = listens_repo.rank_tracks(session, since_utc=None, month_key=None)
        assert ranks[0][2] == "2026-01-02T05:04:05+00:00"


def test_month_key_for_fixed_zoneinfo():
    key = listens_repo.month_key_for(
        "2026-08-01T02:00:00+00:00", ZoneInfo("America/New_York")
    )
    assert key == "2026-07"


def test_rank_order_is_count_then_latest(db):
    with db.session() as session:
        _seed_library(session)
        listens_repo.insert_listen(
            session,
            id="a1",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-01T00:00:00+00:00",
        )
        listens_repo.insert_listen(
            session,
            id="a2",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-02T00:00:00+00:00",
        )
        listens_repo.insert_listen(
            session,
            id="b1",
            track_id="t2",
            profile_tag="source",
            play_source="downloaded",
            counted_at="2026-08-03T00:00:00+00:00",
        )
        session.commit()
        ranks = listens_repo.rank_tracks(session, since_utc=None, month_key=None)
        assert [row[0].id for row in ranks] == ["t1", "t2"]
        assert ranks[0][1] == 2
        assert ranks[1][1] == 1
        assert ranks[0][2] == "2026-08-02T00:00:00+00:00"


def test_artist_rank_uses_artist_id_and_omits_null(db):
    with db.session() as session:
        _seed_library(session)
        listens_repo.insert_listen(
            session,
            id="a1",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-01T00:00:00+00:00",
        )
        listens_repo.insert_listen(
            session,
            id="o1",
            track_id="t3",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-02T00:00:00+00:00",
        )
        session.commit()
        artists = listens_repo.rank_artists(session, since_utc=None, month_key=None)
        assert [row[0].id for row in artists] == ["art-1"]
        tracks = listens_repo.rank_tracks(session, since_utc=None, month_key=None)
        assert {row[0].id for row in tracks} == {"t1", "t3"}


def test_rank_tracks_eager_loads_album(db):
    with db.session() as session:
        _seed_library(session)
        listens_repo.insert_listen(
            session,
            id="a1",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-01T00:00:00+00:00",
        )
        session.commit()
        track, _count, _ts = listens_repo.rank_tracks(
            session, since_utc=None, month_key=None
        )[0]
        session.expunge_all()
        assert track.album is not None
        assert track.album.title == "First"


def test_available_months_unique_descending(db):
    with db.session() as session:
        _seed_library(session)
        listens_repo.insert_listen(
            session,
            id="m1",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-07-15T12:00:00+00:00",
        )
        listens_repo.insert_listen(
            session,
            id="m2",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-15T12:00:00+00:00",
        )
        listens_repo.insert_listen(
            session,
            id="m3",
            track_id="t2",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-16T12:00:00+00:00",
        )
        session.commit()
        months = listens_repo.available_months(session)
        assert months == sorted(set(months), reverse=True)
        assert set(months) <= {"2026-07", "2026-08"}
        assert "2026-08" in months


def test_since_utc_and_month_key_filters(db):
    with db.session() as session:
        _seed_library(session)
        listens_repo.insert_listen(
            session,
            id="old",
            track_id="t1",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-07-15T12:00:00+00:00",
        )
        listens_repo.insert_listen(
            session,
            id="new",
            track_id="t2",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-15T12:00:00+00:00",
        )
        session.commit()
        recent = listens_repo.rank_tracks(
            session, since_utc="2026-08-01T00:00:00+00:00", month_key=None
        )
        assert [row[0].id for row in recent] == ["t2"]
        july = listens_repo.rank_tracks(
            session, since_utc=None, month_key="2026-07"
        )
        assert [row[0].id for row in july] == ["t1"]


def test_bad_counted_at_raises_before_insert(db):
    with db.session() as session:
        _seed_library(session)
        with pytest.raises(listens_repo.ListenBadCountedAt):
            listens_repo.insert_listen(
                session,
                id="bad",
                track_id="t1",
                profile_tag="source",
                play_source="streaming",
                counted_at="not-a-date",
            )
        assert session.scalars(select(ListenEvent)).all() == []


def test_unknown_track_raises_without_add(db):
    with db.session() as session:
        _seed_library(session)
        with pytest.raises(listens_repo.ListenUnknownTrack):
            listens_repo.insert_listen(
                session,
                id="ghost",
                track_id="nope",
                profile_tag="source",
                play_source="streaming",
                counted_at="2026-08-01T00:00:00+00:00",
            )
        assert session.scalars(select(ListenEvent)).all() == []


def test_raw_fk_rejects_unknown_track(db):
    with db.session() as session:
        session.add(
            ListenEvent(
                id="fk",
                track_id="missing",
                profile_tag="source",
                play_source="streaming",
                counted_at="2026-08-01T00:00:00+00:00",
                month_key="2026-08",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_missing_track_still_ranks(db):
    with db.session() as session:
        _seed_library(session)
        listens_repo.insert_listen(
            session,
            id="gone",
            track_id="t-missing",
            profile_tag="source",
            play_source="streaming",
            counted_at="2026-08-01T00:00:00+00:00",
        )
        session.commit()
        ranks = listens_repo.rank_tracks(session, since_utc=None, month_key=None)
        assert ranks[0][0].id == "t-missing"
        assert ranks[0][0].is_missing is True


def test_repository_does_not_export_http_helpers():
    assert not hasattr(listens_repo, "parse_range")
    assert not hasattr(listens_repo, "host_timezone_name")
    assert not hasattr(listens_repo, "validate_listen_body")
