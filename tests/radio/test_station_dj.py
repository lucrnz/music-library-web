"""Debug DJ mutations and status assembly."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from random import Random

from musicweb.db.models import Album, Artist, ScanState, Track
from musicweb.db.repositories import radio as radio_repo
from musicweb.library import Library
from musicweb.radio.debug import EmptyTuners, assemble_status
from musicweb.radio.station import RadioStation


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
    lib: Path,
    *,
    track_id: str,
    artist_id: str,
    album_id: str,
    duration_ms: int = 30_000,
    title: str | None = None,
) -> Track:
    rel = f"{track_id}.flac"
    (lib / rel).write_bytes(b"flac")
    track = Track(
        id=track_id,
        fingerprint=f"fp-{track_id}",
        fingerprint_algo="sha256",
        rel_path=rel,
        title=title or track_id,
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
    session.add(track)
    return track


def _seed_tracks(session, lib: Path, n: int, *, duration_ms: int = 30_000) -> list[str]:
    ids: list[str] = []
    for i in range(n):
        artist_id = f"art-{i}"
        album_id = f"alb-{i}"
        track_id = f"t{i:02d}"
        _insert_artist(session, artist_id=artist_id, name=artist_id)
        _insert_album(session, album_id=album_id, artist_id=artist_id, title=album_id)
        _insert_track(
            session,
            lib,
            track_id=track_id,
            artist_id=artist_id,
            album_id=album_id,
            duration_ms=duration_ms,
        )
        ids.append(track_id)
    session.commit()
    return ids


def _station(tmp_home, db, **kwargs) -> RadioStation:
    library = Library(tmp_home.lib)
    return RadioStation(
        db,
        library,
        probe=kwargs.pop("probe", lambda _path: True),
        rng=kwargs.pop("rng", Random(0)),
        **kwargs,
    )


def _now() -> datetime:
    return datetime(2026, 1, 1, tzinfo=timezone.utc)


def _ready(tmp_home, db, n: int = 24) -> tuple[RadioStation, datetime]:
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, n, duration_ms=30_000)
    station = _station(tmp_home, db)
    t0 = _now()
    station.run_catchup(t0)
    return station, t0


def _stamp_scan(db, stamp: str = "2026-01-01T00:00:01+00:00") -> None:
    with db.session() as session:
        row = session.get(ScanState, 1)
        assert row is not None
        row.kind = "scan"
        row.finished_at = stamp
        row.last_scan_finished_at = stamp
        session.commit()


def test_operator_skip_does_not_add_skip_ids_and_starts_now(tmp_home, db):
    station, t0 = _ready(tmp_home, db)
    first = station.now_playing()
    assert first.track is not None
    first_id = first.track.id
    upcoming = station.peek_upcoming_ids(1)
    assert upcoming
    later = t0 + timedelta(seconds=10)
    result = station.operator_skip(later)
    assert result.ok
    assert first_id not in station.skip_ids
    snap = station.now_playing()
    assert snap.face == "current"
    assert snap.track is not None
    assert snap.track.id == upcoming[0]
    assert snap.started_at == later
    with db.session() as session:
        persisted = radio_repo.load_station(session)
    assert persisted.current_track_id == upcoming[0]


def test_operator_play_injects_and_keeps_upcoming(tmp_home, db):
    station, t0 = _ready(tmp_home, db, n=24)
    current = station.now_playing().track
    assert current is not None
    reserved = {current.id, *station.peek_upcoming_ids(32)}
    with db.session() as session:
        seeded = [f"t{i:02d}" for i in range(24)]
    outside = next(tid for tid in seeded if tid not in reserved)
    before_upcoming = station.peek_upcoming_ids(32)
    later = t0 + timedelta(seconds=3)
    result = station.operator_play(outside, later)
    assert result.ok
    assert result.changed_current
    snap = station.now_playing()
    assert snap.track is not None
    assert snap.track.id == outside
    assert snap.started_at == later
    assert current.id not in station.skip_ids
    assert station.peek_upcoming_ids(32) == before_upcoming
    assert any(outside in batch for batch in station.debug_banlist_batches())


def test_operator_play_already_current_is_noop(tmp_home, db):
    station, t0 = _ready(tmp_home, db)
    snap = station.now_playing()
    assert snap.track is not None
    queue_before = station.peek_upcoming_ids(32)
    result = station.operator_play(snap.track.id, t0 + timedelta(seconds=9))
    assert result.ok
    assert not result.changed_current
    assert not result.changed_started_at
    again = station.now_playing()
    assert again.track is not None
    assert again.track.id == snap.track.id
    assert again.started_at == snap.started_at
    assert station.peek_upcoming_ids(32) == queue_before


def test_operator_play_strips_later_copies(tmp_home, db):
    station, t0 = _ready(tmp_home, db)
    upcoming = station.peek_upcoming_ids(32)
    assert len(upcoming) >= 2
    target = upcoming[1]
    result = station.operator_play(target, t0 + timedelta(seconds=4))
    assert result.ok
    snap = station.now_playing()
    assert snap.track is not None
    assert snap.track.id == target
    assert target not in station.peek_upcoming_ids(32)


def test_operator_play_rejects_ineligible_and_missing(tmp_home, db):
    station, t0 = _ready(tmp_home, db)
    with db.session() as session:
        _insert_artist(session, artist_id="short-art", name="short")
        _insert_album(session, album_id="short-alb", artist_id="short-art", title="s")
        _insert_track(
            session,
            tmp_home.lib,
            track_id="short",
            artist_id="short-art",
            album_id="short-alb",
            duration_ms=1_000,
        )
        session.commit()
    current = station.now_playing().track
    assert current is not None
    short = station.operator_play("short", t0 + timedelta(seconds=1))
    assert not short.ok
    assert short.error == "not_eligible"
    missing = station.operator_play("no-such", t0 + timedelta(seconds=1))
    assert not missing.ok
    assert missing.error == "not_found"
    assert station.now_playing().track is not None
    assert station.now_playing().track.id == current.id


def test_operator_play_probe_fail_adds_skip_ids(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 24, duration_ms=30_000)
    fail_names: set[str] = set()

    def probe(path: Path) -> bool:
        return path.name not in fail_names

    station = _station(tmp_home, db, probe=probe)
    t0 = _now()
    station.run_catchup(t0)
    current = station.now_playing().track
    assert current is not None
    reserved = {current.id, *station.peek_upcoming_ids(32)}
    target = next(tid for tid in (f"t{i:02d}" for i in range(24)) if tid not in reserved)
    fail_names.add(f"{target}.flac")
    result = station.operator_play(target, t0 + timedelta(seconds=1))
    assert not result.ok
    assert result.error == "not_eligible"
    assert target in station.skip_ids
    assert station.now_playing().track is not None
    assert station.now_playing().track.id == current.id


def test_operator_pick_keeps_current_replaces_remainder(tmp_home, db):
    station, t0 = _ready(tmp_home, db, n=32)
    snap = station.now_playing()
    assert snap.track is not None
    current_id = snap.track.id
    started = snap.started_at
    old_upcoming = station.peek_upcoming_ids(32)
    assert old_upcoming
    result = station.operator_pick(t0 + timedelta(seconds=8))
    assert result.ok
    again = station.now_playing()
    assert again.track is not None
    assert again.track.id == current_id
    assert again.started_at == started
    new_upcoming = station.peek_upcoming_ids(32)
    assert new_upcoming
    assert new_upcoming != old_upcoming
    discarded = set(old_upcoming) - set(new_upcoming)
    ban = {tid for batch in station.debug_banlist_batches() for tid in batch}
    assert discarded.isdisjoint(ban - set(new_upcoming))


def test_operator_reset_wipes_and_restarts(tmp_home, db):
    station, t0 = _ready(tmp_home, db)
    station.skip_ids.add("stale")
    later = t0 + timedelta(seconds=20)
    result = station.operator_reset(later)
    assert result.ok
    assert station.skip_ids == set()
    snap = station.now_playing()
    assert snap.face == "current"
    assert snap.track is not None
    assert snap.started_at == later
    assert station.debug_skip_id_list() == []


def test_clear_skip_ids(tmp_home, db):
    station, _t0 = _ready(tmp_home, db)
    station.skip_ids.update({"a", "b"})
    result = station.clear_skip_ids()
    assert result.ok
    assert station.skip_ids == set()


def test_mutations_rejected_while_catching_up(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 8, duration_ms=30_000)
    station = _station(tmp_home, db)
    t0 = _now()
    assert station.now_playing().face == "catching_up"
    assert station.operator_skip(t0).error == "catching_up"
    assert station.operator_play("t00", t0).error == "catching_up"
    assert station.operator_pick(t0).error == "catching_up"
    assert station.operator_reset(t0).error == "catching_up"


def test_idle_skip_fails(tmp_home, db):
    station = _station(tmp_home, db)
    t0 = _now()
    station.run_catchup(t0)
    assert station.now_playing().face == "idle"
    result = station.operator_skip(t0)
    assert not result.ok
    assert result.error == "idle_skip"


def test_idle_play_starts_track(tmp_home, db):
    station = _station(tmp_home, db)
    t0 = _now()
    station.run_catchup(t0)
    assert station.now_playing().face == "idle"
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 16, duration_ms=30_000)
    _stamp_scan(db)
    later = t0 + timedelta(seconds=2)
    play = station.operator_play("t03", later)
    assert play.ok
    snap = station.now_playing()
    assert snap.face == "current"
    assert snap.track is not None
    assert snap.track.id == "t03"
    assert snap.started_at == later


def test_idle_pick_starts_batch(tmp_home, db):
    station = _station(tmp_home, db)
    t0 = _now()
    station.run_catchup(t0)
    assert station.now_playing().face == "idle"
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 16, duration_ms=30_000)
    _stamp_scan(db)
    later = t0 + timedelta(seconds=2)
    picked = station.operator_pick(later)
    assert picked.ok
    snap = station.now_playing()
    assert snap.face == "current"
    assert snap.track is not None
    assert snap.started_at == later


def test_debug_status_omits_spoilers(tmp_home, db):
    station, t0 = _ready(tmp_home, db)
    hidden = assemble_status(station, EmptyTuners(), now=t0, spoilers=False)
    upcoming_ids = station.debug_upcoming_ids()
    assert upcoming_ids
    assert "upcoming" not in hidden
    assert "banlist" not in hidden
    assert hidden["upcoming_count"] == len(upcoming_ids)
    assert hidden["face"] == "current"
    assert hidden["track_id"] == station.now_playing().track.id
    blob = repr(hidden)
    for tid in upcoming_ids:
        assert tid not in blob
    shown = assemble_status(station, EmptyTuners(), now=t0, spoilers=True)
    shown_ids = [row["id"] for row in shown["upcoming"]]
    assert shown_ids == upcoming_ids
    assert shown["banlist"]
