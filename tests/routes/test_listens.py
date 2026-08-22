"""Listen ingest and ranking handlers (no TestClient)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from musicweb.db.models import Album, Artist, ListenEvent, Track
from musicweb.routes.listens import (
    ListenIn,
    counted_at_not_in_future,
    get_listen_rankings,
    host_timezone_name,
    parse_range,
    post_listen,
)
from musicweb.routes.serializers import artist_dict, track_dict


def _seed(session) -> None:
    session.add(
        Artist(
            id="art-1",
            name="Alpha",
            name_norm="alpha",
            sort_name="alpha",
            album_count=1,
            track_count=1,
        )
    )
    session.add(
        Album(
            id="alb-1",
            artist_id="art-1",
            title="First",
            title_norm="first",
            track_count=1,
            has_cover=False,
        )
    )
    session.add(
        Track(
            id="t1",
            fingerprint="fp-t1",
            fingerprint_algo="sha256",
            rel_path="t1.flac",
            title="One",
            artist_name="Alpha",
            album_artist_name="Alpha",
            artist_id="art-1",
            album_id="alb-1",
            album_artist_id="art-1",
            size_bytes=1,
            mtime_ns=1,
            is_missing=False,
            added_at="t",
            indexed_at="t",
        )
    )
    session.flush()


def _body(**overrides) -> ListenIn:
    values = dict(
        id="e1",
        track_id="t1",
        profile="source",
        play_source="streaming",
        counted_at="2026-08-15T12:00:00+00:00",
    )
    values.update(overrides)
    return ListenIn(**values)


def test_post_insert_and_duplicate_are_204(db):
    with db.session() as session:
        _seed(session)
        first = post_listen(_body(), db=session)
        second = post_listen(_body(), db=session)
        session.commit()
        assert first.status_code == 204
        assert second.status_code == 204


def test_unknown_track_is_422(db):
    with db.session() as session:
        _seed(session)
        with pytest.raises(HTTPException) as err:
            post_listen(_body(track_id="missing"), db=session)
        assert err.value.status_code == 422


def test_future_counted_at_is_422(db):
    with db.session() as session:
        _seed(session)
        future = (
            datetime.now(timezone.utc) + timedelta(minutes=10)
        ).replace(microsecond=0).isoformat()
        with pytest.raises(HTTPException) as err:
            post_listen(_body(counted_at=future), db=session)
        assert err.value.status_code == 422


def test_parse_range_tokens_and_invalid():
    now = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)
    tz = ZoneInfo("America/New_York")
    assert parse_range(None, now=now, tz=tz).range == "all"
    assert parse_range("", now=now, tz=tz).range == "all"
    assert parse_range("nope", now=now, tz=tz).range == "all"
    assert parse_range("2026-13", now=now, tz=tz).range == "all"
    week = parse_range("7d", now=now, tz=tz)
    month = parse_range("30d", now=now, tz=tz)
    cal = parse_range("2026-08", now=now, tz=tz)
    assert week.range == "7d"
    assert month.range == "30d"
    assert week.since_utc == "2026-08-13T12:00:00+00:00"
    assert month.since_utc == "2026-07-21T12:00:00+00:00"
    assert cal == ("2026-08", None, "2026-08")


def test_host_timezone_name():
    assert host_timezone_name(ZoneInfo("America/New_York")) == "America/New_York"
    assert host_timezone_name(timezone.utc) == "local"


def test_rankings_echo_range_and_unfiltered_months(db):
    with db.session() as session:
        _seed(session)
        post_listen(
            _body(id="old", counted_at="2026-07-15T12:00:00+00:00"),
            db=session,
        )
        post_listen(
            _body(id="new", counted_at="2026-08-15T12:00:00+00:00"),
            db=session,
        )
        session.commit()
        all_time = get_listen_rankings(range="all", db=session)
        week = get_listen_rankings(range="7d", db=session)
        month = get_listen_rankings(range="30d", db=session)
        august = get_listen_rankings(range="2026-08", db=session)
        invalid = get_listen_rankings(range="99-1", db=session)
        assert all_time["range"] == "all"
        assert week["range"] == "7d"
        assert month["range"] == "30d"
        assert august["range"] == "2026-08"
        assert invalid["range"] == "all"
        assert all_time["timezone"] in {"local"} or "/" in all_time["timezone"]
        assert all_time["months"] == invalid["months"]
        assert "2026-08" in all_time["months"]
        assert week["months"] == all_time["months"]
        assert all_time["tracks"][0]["play_count"] == 2
        track = session.get(Track, "t1")
        artist = session.get(Artist, "art-1")
        assert "play_count" not in track_dict(track)
        assert "play_count" not in artist_dict(artist)
        assert "last_counted_at" not in track_dict(track)
        assert "last_counted_at" not in artist_dict(artist)


def test_pydantic_rejects_bad_play_source():
    with pytest.raises(ValidationError):
        _body(play_source="exclusive")


def test_pydantic_rejects_bad_origin():
    with pytest.raises(ValidationError):
        _body(origin="exclusive")


def test_omitted_origin_stores_queue(db):
    with db.session() as session:
        _seed(session)
        assert _body().origin == "queue"
        post_listen(_body(), db=session)
        session.commit()
        row = session.get(ListenEvent, "e1")
        assert row is not None
        assert row.origin == "queue"


def test_radio_origin_stores_radio(db):
    with db.session() as session:
        _seed(session)
        post_listen(_body(origin="radio"), db=session)
        session.commit()
        row = session.get(ListenEvent, "e1")
        assert row is not None
        assert row.origin == "radio"


def test_rankings_mix_queue_and_radio_origins(db):
    with db.session() as session:
        _seed(session)
        post_listen(_body(id="q", origin="queue"), db=session)
        post_listen(_body(id="r", origin="radio"), db=session)
        session.commit()
        all_time = get_listen_rankings(range="all", db=session)
        assert all_time["tracks"][0]["play_count"] == 2
        assert "origin" not in all_time
        assert "origin" not in all_time["tracks"][0]


def test_counted_at_not_in_future_allows_past():
    now = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)
    counted_at_not_in_future("2026-01-01T00:00:00+00:00", now=now)
