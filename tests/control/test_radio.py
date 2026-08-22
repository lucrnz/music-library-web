"""Radio debug methods on the Unix control plane."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from random import Random
from types import SimpleNamespace

from musicweb.control.protocol import ControlRequest
from musicweb.control.server import ControlServer
from musicweb.db.models import Album, Artist, Track
from musicweb.library import Library
from musicweb.radio.station import RadioStation
from musicweb.radio.tuners import TunerRegistry


class _Loop:
    def __init__(self) -> None:
        self.fns: list = []

    def call_soon_threadsafe(self, fn, *args) -> None:
        self.fns.append((fn, args))


def _insert_track(session, lib: Path, *, track_id: str, n: int) -> None:
    artist_id = f"art-{n}"
    album_id = f"alb-{n}"
    session.add(
        Artist(
            id=artist_id,
            name=artist_id,
            name_norm=artist_id,
            sort_name=artist_id,
            album_count=1,
            track_count=1,
        )
    )
    session.add(
        Album(
            id=album_id,
            artist_id=artist_id,
            title=album_id,
            title_norm=album_id,
            track_count=1,
            has_cover=False,
        )
    )
    rel = f"{track_id}.flac"
    (lib / rel).write_bytes(b"flac")
    session.add(
        Track(
            id=track_id,
            fingerprint=f"fp-{track_id}",
            fingerprint_algo="sha256",
            rel_path=rel,
            title=track_id,
            artist_name=artist_id,
            album_artist_name=artist_id,
            artist_id=artist_id,
            album_id=album_id,
            album_artist_id=artist_id,
            duration_ms=30_000,
            size_bytes=1,
            mtime_ns=1,
            is_missing=False,
            added_at="t",
            indexed_at="t",
        )
    )


def _seed(db, lib: Path, n: int) -> None:
    with db.session() as session:
        for i in range(n):
            _insert_track(session, lib, track_id=f"t{i:02d}", n=i)
        session.commit()


def _station(tmp_home, db) -> RadioStation:
    return RadioStation(
        db,
        Library(tmp_home.lib),
        probe=lambda _path: True,
        rng=Random(0),
    )


def _ready(tmp_home, db, n: int = 24) -> RadioStation:
    _seed(db, tmp_home.lib, n)
    station = _station(tmp_home, db)
    station.run_catchup(datetime(2026, 1, 1, tzinfo=timezone.utc))
    return station


def _ctl(tmp_home, station: RadioStation | None = None, loop: _Loop | None = None) -> tuple[ControlServer, _Loop]:
    server = ControlServer(tmp_home.data, jobs=SimpleNamespace())
    bound = loop or _Loop()
    if station is not None:
        server.bind_radio(station, TunerRegistry(), bound)
    return server, bound


def _call(server: ControlServer, method: str, **params):
    return server._dispatch(ControlRequest(method=method, params=params))


def test_unbound_radio_methods_fail(tmp_home):
    server, _loop = _ctl(tmp_home)
    resp = _call(server, "radio_status")
    assert not resp.ok
    assert resp.error == "radio_unbound"


def test_status_hides_spoilers(tmp_home, db):
    station = _ready(tmp_home, db)
    upcoming = station.debug_upcoming_ids()
    assert upcoming
    server, _loop = _ctl(tmp_home, station)
    hidden = _call(server, "radio_status", spoilers=False)
    assert hidden.ok
    assert "upcoming" not in hidden.result
    assert "banlist" not in hidden.result
    blob = repr(hidden.result)
    for tid in upcoming:
        assert tid not in blob
    shown = _call(server, "radio_status", spoilers=True)
    assert shown.ok
    assert [row["id"] for row in shown.result["upcoming"]] == upcoming


def test_skip_and_reset_schedule_notify_pick_does_not(tmp_home, db):
    station = _ready(tmp_home, db)
    server, loop = _ctl(tmp_home, station)
    skip = _call(server, "radio_skip")
    assert skip.ok
    assert loop.fns == [(station.notify_loop, ())]
    loop.fns.clear()
    pick = _call(server, "radio_pick")
    assert pick.ok
    assert loop.fns == []
    reset = _call(server, "radio_reset")
    assert reset.ok
    assert loop.fns == [(station.notify_loop, ())]


def test_play_notifies_only_when_current_changes(tmp_home, db):
    station = _ready(tmp_home, db)
    current = station.now_playing().track
    assert current is not None
    reserved = {current.id, *station.peek_upcoming_ids(32)}
    outside = next(tid for tid in (f"t{i:02d}" for i in range(24)) if tid not in reserved)
    server, loop = _ctl(tmp_home, station)
    same = _call(server, "radio_play", track_id=current.id)
    assert same.ok
    assert loop.fns == []
    changed = _call(server, "radio_play", track_id=outside)
    assert changed.ok
    assert changed.result["track_id"] == outside
    assert loop.fns == [(station.notify_loop, ())]


def test_catching_up_and_idle_skip_errors(tmp_home, db):
    catching = _station(tmp_home, db)
    server, loop = _ctl(tmp_home, catching)
    resp = _call(server, "radio_skip")
    assert not resp.ok
    assert resp.error == "catching_up"
    assert loop.fns == []
    idle = _station(tmp_home, db)
    idle.run_catchup(datetime(2026, 1, 1, tzinfo=timezone.utc))
    server, loop = _ctl(tmp_home, idle)
    resp = _call(server, "radio_skip")
    assert not resp.ok
    assert resp.error == "idle_skip"
    assert loop.fns == []


def test_skip_ids_clear_does_not_notify(tmp_home, db):
    station = _ready(tmp_home, db)
    station.skip_ids.add("stale")
    server, loop = _ctl(tmp_home, station)
    listed = _call(server, "radio_skip_ids")
    assert listed.ok
    assert any(row["id"] == "stale" for row in listed.result["skip_ids"])
    cleared = _call(server, "radio_skip_ids_clear")
    assert cleared.ok
    assert cleared.result["skip_ids"] == []
    assert loop.fns == []
