"""Catalog snapshot + eligible-row filters."""

from pathlib import Path
from types import SimpleNamespace

from musicweb.db.models import Album, Artist, Track
from musicweb.db.repositories import radio as radio_repo
from musicweb.radio.catalog import snapshot_from_rows
from musicweb.radio.types import EligibleRow


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
    duration_ms: int | None = 180_000,
    missing: bool = False,
    is_lossy: bool = False,
    rel_path: str | None = None,
) -> Track:
    track = Track(
        id=track_id,
        fingerprint=f"fp-{track_id}",
        fingerprint_algo="sha256",
        rel_path=None if missing else (rel_path or f"{track_id}.flac"),
        title=title,
        artist_name="Artist",
        album_artist_name="Artist",
        artist_id=artist_id,
        album_id=album_id,
        album_artist_id=artist_id,
        duration_ms=duration_ms,
        size_bytes=1,
        mtime_ns=1,
        is_missing=missing,
        is_lossy=is_lossy,
        added_at="t",
        indexed_at="t",
    )
    session.add(track)
    return track


def test_eligible_rows_include_lossy_exclude_hard_filters(db):
    with db.session() as session:
        _insert_artist(session, artist_id="art-1", name="Alpha")
        _insert_album(session, album_id="alb-1", artist_id="art-1", title="First")
        _insert_track(
            session,
            track_id="ok-lossless",
            title="Ok",
            artist_id="art-1",
            album_id="alb-1",
        )
        _insert_track(
            session,
            track_id="ok-lossy",
            title="Mp3",
            artist_id="art-1",
            album_id="alb-1",
            is_lossy=True,
            rel_path="ok-lossy.mp3",
        )
        _insert_track(
            session,
            track_id="short",
            title="Short",
            artist_id="art-1",
            album_id="alb-1",
            duration_ms=29_999,
        )
        _insert_track(
            session,
            track_id="missing",
            title="Gone",
            artist_id="art-1",
            album_id="alb-1",
            missing=True,
        )
        _insert_track(
            session,
            track_id="no-album",
            title="Orphan",
            artist_id=None,
            album_id=None,
        )
        session.commit()

    with db.session() as session:
        rows = radio_repo.list_eligible_rows(session)
    ids = {row.id for row in rows}
    assert ids == {"ok-lossless", "ok-lossy"}
    assert all(row.album_artist_id == "art-1" for row in rows)
    assert all(row.artist_id == "art-1" for row in rows)


def test_resolve_failure_omits_row(tmp_path):
    good = tmp_path / "good.flac"
    good.write_bytes(b"x")

    class FakeLib:
        def present_audio(self, rel: str | None) -> Path | None:
            if rel in {"jail.flac", "missing.flac"}:
                return None
            return good

    rows = [
        EligibleRow("t-ok", "ok.flac", 180_000, "alb", "art", "art"),
        EligibleRow("t-jail", "jail.flac", 180_000, "alb", "art", "art"),
        EligibleRow("t-missing", "missing.flac", 180_000, "alb", "art", "art"),
    ]
    snap = snapshot_from_rows(FakeLib(), rows)  # type: ignore[arg-type]
    ids = {t.id for t in snap.all_tracks()}
    assert ids == {"t-ok"}
    assert snap.all_tracks()[0].path == good


def test_snapshot_has_no_source_tech(tmp_path):
    path = tmp_path / "a.flac"
    path.write_bytes(b"x")
    lib = SimpleNamespace(present_audio=lambda _rel: path)
    snap = snapshot_from_rows(
        lib,  # type: ignore[arg-type]
        [EligibleRow("t1", "a.flac", 180_000, "alb", "art", "art")],
    )
    track = snap.all_tracks()[0]
    assert not hasattr(track, "is_lossy")
    assert not hasattr(track, "source_codec")


def test_snapshot_groups_va_guests_by_performer(tmp_path):
    path = tmp_path / "a.flac"
    path.write_bytes(b"x")
    lib = SimpleNamespace(present_audio=lambda _rel: path)
    snap = snapshot_from_rows(
        lib,  # type: ignore[arg-type]
        [
            EligibleRow("bj", "a.flac", 180_000, "now", "va", "bon-jovi"),
            EligibleRow("ac", "a.flac", 180_000, "now", "va", "alice"),
        ],
    )
    assert set(snap.artists) == {"bon-jovi", "alice"}
    assert {t.id for t in snap.artists["bon-jovi"]["now"]} == {"bj"}
    assert {t.id for t in snap.artists["alice"]["now"]} == {"ac"}
