"""Catch-up walks the queue by wall-clock without blocking startup."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from random import Random

from musicweb.db.models import Album, Artist, Track
from musicweb.library import Library
from musicweb.radio.station import RadioStation


def _seed_tracks(session, lib, n: int, *, duration_ms: int = 30_000) -> list[str]:
    ids: list[str] = []
    for i in range(n):
        artist_id = f"art-{i}"
        album_id = f"alb-{i}"
        track_id = f"t{i:02d}"
        session.add(
            Artist(
                id=artist_id,
                name=artist_id,
                name_norm=artist_id.lower(),
                sort_name=artist_id.lower(),
                album_count=1,
                track_count=1,
            )
        )
        session.add(
            Album(
                id=album_id,
                artist_id=artist_id,
                title=album_id,
                title_norm=album_id.lower(),
                track_count=1,
                has_cover=False,
            )
        )
        (lib / f"{track_id}.flac").write_bytes(b"flac")
        session.add(
            Track(
                id=track_id,
                fingerprint=f"fp-{track_id}",
                fingerprint_algo="sha256",
                rel_path=f"{track_id}.flac",
                title=track_id,
                artist_name=artist_id,
                album_artist_name=artist_id,
                artist_id=artist_id,
                album_id=album_id,
                album_artist_id=artist_id,
                duration_ms=duration_ms,
                size_bytes=1,
                mtime_ns=1,
                is_missing=False,
                added_at="t",
                indexed_at="t",
            )
        )
        ids.append(track_id)
    session.commit()
    return ids


def _station(tmp_home, db) -> RadioStation:
    return RadioStation(
        db,
        Library(tmp_home.lib),
        probe=lambda _path: True,
        rng=Random(0),
    )


def test_catchup_skips_two_tracks_and_lands_mid_third(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 10, duration_ms=30_000)
    station = _station(tmp_home, db)
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(t0)
    first = station.now_playing()
    assert first.face == "current"
    assert first.track is not None
    first_id = first.track.id
    upcoming = station.peek_upcoming_ids(2)
    assert len(upcoming) == 2
    third_id = upcoming[1]

    station.run_catchup(t0 + timedelta(milliseconds=75_000))
    landed = station.now_playing()
    assert landed.face == "current"
    assert landed.track is not None
    assert landed.track.id == third_id
    assert landed.track.id != first_id
    assert landed.started_at == t0 + timedelta(milliseconds=60_000)
    pos = landed.position_seconds(t0 + timedelta(milliseconds=75_000))
    assert pos == 15.0


def test_catchup_log_has_no_upcoming_titles(tmp_home, db, caplog):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 10, duration_ms=30_000)
    station = _station(tmp_home, db)
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(t0)
    upcoming = station.peek_upcoming_ids(2)
    walked_past = upcoming[0]
    with caplog.at_level("INFO", logger="musicweb.radio.station"):
        station.run_catchup(t0 + timedelta(seconds=90))
    text = caplog.text
    assert "catch-up advanced" in text
    assert walked_past not in text
