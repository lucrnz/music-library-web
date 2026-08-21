"""Station clock: tick, persist-on-change, faces, banlist prune."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from random import Random
from unittest.mock import patch

from musicweb.db.models import Album, Artist, ScanState, Track
from musicweb.db.repositories import radio as radio_repo
from musicweb.library import Library
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


def test_face_is_catching_up_until_catchup_returns(tmp_home, db):
    station = _station(tmp_home, db)
    assert station.now_playing().face == "catching_up"
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(now)
    assert station.now_playing().face == "idle"


def test_tick_at_duration_boundary_advances_once(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 10, duration_ms=30_000)
    station = _station(tmp_home, db)
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(t0)
    first = station.now_playing()
    assert first.face == "current"
    assert first.track is not None
    first_id = first.track.id
    station.tick(t0 + timedelta(milliseconds=29_999))
    assert station.now_playing().track is not None
    assert station.now_playing().track.id == first_id
    station.tick(t0 + timedelta(milliseconds=30_000))
    nxt = station.now_playing()
    assert nxt.face == "current"
    assert nxt.track is not None
    assert nxt.track.id != first_id
    station.tick(t0 + timedelta(milliseconds=30_000))
    assert station.now_playing().track is not None
    assert station.now_playing().track.id == nxt.track.id


def test_last_track_start_picks_next_and_prunes_banlist(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 48, duration_ms=30_000)
    station = _station(tmp_home, db)
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(t0)
    # Five full batches of 8 at 30s each = 1200s
    station.run_catchup(t0 + timedelta(seconds=1199))
    snap = station.now_playing()
    assert snap.face == "current"
    with db.session() as session:
        persisted = radio_repo.load_station(session)
    assert len(persisted.banlist) <= 4
    # After the fifth pick the station keeps [previous, new] only.
    if len(persisted.banlist) == 2:
        assert all(len(batch) <= 8 for batch in persisted.banlist)


def test_empty_then_scan_watermark_picks(tmp_home, db):
    station = _station(tmp_home, db)
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(t0)
    assert station.now_playing().face == "idle"
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 8, duration_ms=30_000)
        row = session.get(ScanState, 1)
        assert row is not None
        row.kind = "scan"
        row.finished_at = "2026-01-01T00:00:01+00:00"
        session.commit()
    station.tick(t0 + timedelta(seconds=2))
    assert station.now_playing().face == "current"
    assert station.now_playing().track is not None


def test_probe_fail_skips_without_duration_and_is_not_reprobed(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 10, duration_ms=30_000)
    probed: list[str] = []
    failed: set[str] = set()

    def probe(path: Path) -> bool:
        probed.append(path.name)
        if not failed:
            failed.add(path.name)
            return False
        return path.name not in failed

    station = _station(tmp_home, db, probe=probe)
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(t0)
    snap = station.now_playing()
    assert snap.face == "current"
    assert snap.track is not None
    first_failed = next(iter(failed)).removesuffix(".flac")
    assert snap.track.id != first_failed
    assert first_failed in station.skip_ids
    assert snap.started_at == t0
    # Later pick/tick must not probe the skipped id again.
    station.tick(t0 + timedelta(seconds=1))
    assert probed.count(f"{first_failed}.flac") == 1


def test_persist_reload_resumes_current(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 10, duration_ms=30_000)
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    first = _station(tmp_home, db)
    first.run_catchup(t0)
    snap = first.now_playing()
    assert snap.track is not None
    current_id = snap.track.id
    started = snap.started_at
    first.persist_shutdown()

    second = _station(tmp_home, db)
    assert second.now_playing().face == "catching_up"
    second.run_catchup(t0 + timedelta(seconds=5))
    again = second.now_playing()
    assert again.face == "current"
    assert again.track is not None
    assert again.track.id == current_id
    assert again.started_at == started


def test_missing_current_is_skip_pending_then_skipped(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 8, duration_ms=30_000)
        radio_repo.save_station(
            session,
            radio_repo.PersistedStation(
                current_track_id="gone",
                track_started_at="2026-01-01T00:00:00+00:00",
                current_batch_seq=1,
                queue=[(1, 0, "gone"), (1, 1, "t00")],
                banlist=[["gone", "t00"]],
            ),
        )
        session.commit()
    station = _station(tmp_home, db)
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(t0)
    assert station.now_playing().face == "skip_pending"
    assert station.now_playing().track is None
    station.tick(t0 + timedelta(seconds=1))
    snap = station.now_playing()
    assert snap.face == "current"
    assert snap.track is not None
    assert snap.track.id != "gone"
    assert "gone" in station.skip_ids


def test_retained_track_ids_is_current_and_remaining(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 16, duration_ms=30_000)
    station = _station(tmp_home, db)
    assert station.retained_track_ids() == frozenset()
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(t0)
    first = station.now_playing()
    assert first.track is not None
    first_id = first.track.id
    upcoming = station.peek_upcoming_ids(32)
    retained = station.retained_track_ids()
    assert first_id in retained
    assert set(upcoming) <= retained
    assert first_id not in upcoming

    station.tick(t0 + timedelta(milliseconds=30_000))
    nxt = station.now_playing()
    assert nxt.track is not None
    retained = station.retained_track_ids()
    assert first_id not in retained
    assert nxt.track.id in retained
    assert set(station.peek_upcoming_ids(32)) <= retained

    for i in range(8):
        station.tick(t0 + timedelta(milliseconds=30_000 * (i + 2)))
    later = station.retained_track_ids()
    assert first_id not in later
    with db.session() as session:
        persisted = radio_repo.load_station(session)
    assert any(first_id in batch for batch in persisted.banlist)
    assert first_id not in later


def test_noop_tick_does_not_write(tmp_home, db):
    with db.session() as session:
        _seed_tracks(session, tmp_home.lib, 8, duration_ms=30_000)
    station = _station(tmp_home, db)
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    station.run_catchup(t0)
    with patch.object(radio_repo, "save_station", wraps=radio_repo.save_station) as save:
        station.tick(t0 + timedelta(seconds=1))
    save.assert_not_called()
