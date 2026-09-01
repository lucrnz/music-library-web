"""Track identity: ensure, reattach, replace, apply fields."""

from pathlib import Path

from musicweb.db.fts import fts_search_track_ids
from musicweb.db.models import Track
from musicweb.db.names import track_id_for
from musicweb.metadata import TrackMetadata
from musicweb.db.va import VA_ARTIST_ID, VA_DISPLAY_NAME
from musicweb.scan.identity import (
    apply_track_fields,
    ensure_album,
    ensure_artist,
    resolve_track,
)


def _meta(**overrides) -> TrackMetadata:
    values = dict(
        title="Paranoid Android",
        artist="Radiohead",
        album="OK Computer",
        albumartist="Radiohead",
        track=2,
        disc=1,
        year=1997,
        duration=383.0,
        sample_rate_hz=44100,
        bit_depth=16,
        channels=2,
        source_codec="flac",
        bitrate_kbps=None,
    )
    values.update(overrides)
    return TrackMetadata(**values)


def test_ensure_artist_and_album_idempotent_and_year_fill(db):
    with db.session() as session:
        a1 = ensure_artist(session, "Radiohead")
        a2 = ensure_artist(session, "radiohead")
        assert a1.id == a2.id
        album = ensure_album(session, a1, "OK Computer", None)
        assert album.year is None
        again = ensure_album(session, a1, "OK Computer", 1997)
        assert again.id == album.id
        assert again.year == 1997
        session.commit()


def test_ensure_artist_collapses_va_aliases(db):
    with db.session() as session:
        a1 = ensure_artist(session, "V.A.")
        a2 = ensure_artist(session, "Various Artists")
        a3 = ensure_artist(session, "オムニバス")
        assert a1.id == a2.id == a3.id == VA_ARTIST_ID
        assert a1.name == VA_DISPLAY_NAME
        session.commit()


def test_resolve_track_reattaches_same_fingerprint(db):
    tid = track_id_for("sha256", "aaa")
    with db.session() as session:
        first = resolve_track(
            session,
            fingerprint="aaa",
            fingerprint_algo="sha256",
            track_id=tid,
            rel_path="old/a.flac",
            existing_by_path=None,
            now="t0",
        )
        session.commit()
        first_id = first.id

    with db.session() as session:
        existing = session.get(Track, first_id)
        moved = resolve_track(
            session,
            fingerprint="aaa",
            fingerprint_algo="sha256",
            track_id=tid,
            rel_path="new/a.flac",
            existing_by_path=None,
            now="t1",
        )
        session.commit()
        assert moved.id == first_id
        assert moved.rel_path == "new/a.flac"
        assert moved.is_missing is False


def test_resolve_track_new_fingerprint_marks_old_missing(db):
    old_id = track_id_for("sha256", "aaa")
    new_id = track_id_for("sha256", "bbb")
    with db.session() as session:
        old = resolve_track(
            session,
            fingerprint="aaa",
            fingerprint_algo="sha256",
            track_id=old_id,
            rel_path="same/a.flac",
            existing_by_path=None,
            now="t0",
        )
        session.commit()
        old_pk = old.id

    with db.session() as session:
        existing = session.get(Track, old_pk)
        new = resolve_track(
            session,
            fingerprint="bbb",
            fingerprint_algo="sha256",
            track_id=new_id,
            rel_path="same/a.flac",
            existing_by_path=existing,
            now="t1",
        )
        session.commit()
        old = session.get(Track, old_pk)
        assert old is not None
        assert old.is_missing is True
        assert old.rel_path is None
        assert new.id == new_id
        assert new.rel_path == "same/a.flac"
        assert new.id != old_pk


def test_resolve_track_does_not_steal_unripped_stub(db):
    stub_id = track_id_for("cd-discid", "disc:1")
    file_id = track_id_for("sha256", "deadbeef")
    with db.session() as session:
        session.add(
            Track(
                id=stub_id,
                fingerprint="disc:1",
                fingerprint_algo="cd-discid",
                rel_path=None,
                title="Stub",
                artist_name="X",
                album_artist_name="X",
                size_bytes=0,
                mtime_ns=0,
                is_missing=True,
                unripped=True,
                added_at="t",
                indexed_at="t",
            )
        )
        session.commit()

    with db.session() as session:
        found = resolve_track(
            session,
            fingerprint="deadbeef",
            fingerprint_algo="sha256",
            track_id=file_id,
            rel_path="real.flac",
            existing_by_path=None,
            now="t1",
        )
        session.commit()
        assert found.id == file_id
        stub = session.get(Track, stub_id)
        assert stub is not None
        assert stub.rel_path is None
        assert stub.is_missing is True
        assert stub.unripped is True


def test_apply_track_fields_writes_columns_and_fts(db, tmp_path):
    path = tmp_path / "paranoid.flac"
    path.write_bytes(b"x")
    tid = track_id_for("sha256", "fp1")
    with db.session() as session:
        track = resolve_track(
            session,
            fingerprint="fp1",
            fingerprint_algo="sha256",
            track_id=tid,
            rel_path="paranoid.flac",
            existing_by_path=None,
            now="t0",
        )
        album_id = apply_track_fields(
            session,
            track,
            path=Path(path),
            size=3,
            mtime_ns=9,
            meta=_meta(),
            now="t1",
        )
        session.commit()
        assert album_id
        assert track.title == "Paranoid Android"
        assert track.artist_name == "Radiohead"
        assert track.size_bytes == 3
        assert track.mtime_ns == 9
        assert fts_search_track_ids(session, "parano") == [tid]
        assert track.bitrate_mode is None


def test_apply_track_fields_persists_lossy_bitrate_mode(db, tmp_path):
    path = tmp_path / "song.mp3"
    path.write_bytes(b"x")
    tid = track_id_for("sha256", "fp-mp3")
    with db.session() as session:
        track = resolve_track(
            session,
            fingerprint="fp-mp3",
            fingerprint_algo="sha256",
            track_id=tid,
            rel_path="song.mp3",
            existing_by_path=None,
            now="t0",
        )
        for mode in ("cbr", "vbr", "abr"):
            apply_track_fields(
                session,
                track,
                path=Path(path),
                size=3,
                mtime_ns=9,
                meta=_meta(source_codec="mp3", bitrate_kbps=320, bitrate_mode=mode),
                now="t1",
            )
            assert track.bitrate_kbps == 320
            assert track.bitrate_mode == mode
        session.commit()
