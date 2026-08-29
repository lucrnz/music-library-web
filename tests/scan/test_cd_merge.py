"""Scan attaches a later rip to an unripped CD stub."""

from pathlib import Path

from musicweb.db.fts import fts_search_track_ids
from musicweb.db.models import Track
from musicweb.db.names import track_id_for
from musicweb.metadata import TrackMetadata
from musicweb.scan.identity import apply_track_fields, ensure_album, ensure_artist, resolve_track


def _meta(**overrides) -> TrackMetadata:
    values = dict(
        title="One",
        artist="Band",
        album="Demo",
        albumartist="Band",
        track=1,
        disc=1,
        year=2000,
        duration=100.0,
        sample_rate_hz=44100,
        bit_depth=16,
        channels=2,
        source_codec="flac",
        bitrate_kbps=None,
    )
    values.update(overrides)
    return TrackMetadata(**values)


def _stub(session, *, album_id: str, artist_id: str, track_no: int, discid: str = "disc") -> Track:
    fingerprint = f"{discid}:{track_no}"
    tid = track_id_for("cd-discid", fingerprint)
    row = Track(
        id=tid,
        fingerprint=fingerprint,
        fingerprint_algo="cd-discid",
        rel_path=None,
        title=f"Stub {track_no}",
        artist_name="Band",
        album_artist_name="Band",
        artist_id=artist_id,
        album_id=album_id,
        album_artist_id=artist_id,
        track_no=track_no,
        disc_no=1,
        size_bytes=0,
        mtime_ns=0,
        is_missing=True,
        unripped=True,
        added_at="t",
        indexed_at="t",
    )
    session.add(row)
    session.flush()
    return row


def _present(
    session,
    *,
    album_id: str,
    artist_id: str,
    track_no: int,
    track_id: str,
    rel_path: str,
) -> Track:
    row = Track(
        id=track_id,
        fingerprint=f"sha-{track_id}",
        fingerprint_algo="sha256",
        rel_path=rel_path,
        title=f"Lib {track_no}",
        artist_name="Band",
        album_artist_name="Band",
        artist_id=artist_id,
        album_id=album_id,
        album_artist_id=artist_id,
        track_no=track_no,
        disc_no=1,
        size_bytes=1,
        mtime_ns=1,
        is_missing=False,
        unripped=False,
        added_at="t",
        indexed_at="t",
    )
    session.add(row)
    session.flush()
    return row


def test_merge_reuses_stub_id(db, tmp_path):
    path = tmp_path / "one.flac"
    path.write_bytes(b"flac")
    file_id = track_id_for("sha256", "rip-1")
    with db.session() as session:
        artist = ensure_artist(session, "Band")
        album = ensure_album(session, artist, "Demo", 2000)
        stub = _stub(session, album_id=album.id, artist_id=artist.id, track_no=1)
        stub_id = stub.id
        transient = resolve_track(
            session,
            fingerprint="rip-1",
            fingerprint_algo="sha256",
            track_id=file_id,
            rel_path="one.flac",
            existing_by_path=None,
            now="t0",
        )
        apply_track_fields(
            session,
            transient,
            path=Path(path),
            size=4,
            mtime_ns=9,
            meta=_meta(),
            now="t1",
        )
        session.commit()
        assert session.get(Track, file_id) is None
        merged = session.get(Track, stub_id)
        assert merged is not None
        assert merged.unripped is False
        assert merged.is_missing is False
        assert merged.rel_path == "one.flac"
        assert merged.fingerprint == "rip-1"
        assert merged.title == "One"
        assert fts_search_track_ids(session, "One") == [stub_id]


def test_merge_fills_hole_not_present_slot(db, tmp_path):
    path = tmp_path / "thirteen.flac"
    path.write_bytes(b"flac")
    file_id = track_id_for("sha256", "rip-13")
    with db.session() as session:
        artist = ensure_artist(session, "Band")
        album = ensure_album(session, artist, "Demo", 2000)
        _present(
            session,
            album_id=album.id,
            artist_id=artist.id,
            track_no=1,
            track_id="lib-1",
            rel_path="1.flac",
        )
        hole = _stub(session, album_id=album.id, artist_id=artist.id, track_no=13)
        hole_id = hole.id
        transient = resolve_track(
            session,
            fingerprint="rip-13",
            fingerprint_algo="sha256",
            track_id=file_id,
            rel_path="thirteen.flac",
            existing_by_path=None,
            now="t0",
        )
        apply_track_fields(
            session,
            transient,
            path=Path(path),
            size=4,
            mtime_ns=9,
            meta=_meta(title="Thirteen", track=13),
            now="t1",
        )
        session.commit()
        assert session.get(Track, "lib-1") is not None
        merged = session.get(Track, hole_id)
        assert merged is not None
        assert merged.rel_path == "thirteen.flac"
        assert merged.unripped is False


def test_merge_does_not_replace_present_file(db, tmp_path):
    path = tmp_path / "one.flac"
    path.write_bytes(b"flac")
    file_id = track_id_for("sha256", "rip-new")
    with db.session() as session:
        artist = ensure_artist(session, "Band")
        album = ensure_album(session, artist, "Demo", 2000)
        _present(
            session,
            album_id=album.id,
            artist_id=artist.id,
            track_no=1,
            track_id="lib-1",
            rel_path="old.flac",
        )
        leftover = _stub(session, album_id=album.id, artist_id=artist.id, track_no=1)
        leftover_id = leftover.id
        transient = resolve_track(
            session,
            fingerprint="rip-new",
            fingerprint_algo="sha256",
            track_id=file_id,
            rel_path="one.flac",
            existing_by_path=None,
            now="t0",
        )
        apply_track_fields(
            session,
            transient,
            path=Path(path),
            size=4,
            mtime_ns=9,
            meta=_meta(),
            now="t1",
        )
        session.commit()
        present = session.get(Track, "lib-1")
        assert present is not None
        assert present.rel_path == "old.flac"
        stub = session.get(Track, leftover_id)
        assert stub is not None
        assert stub.unripped is True
        assert stub.is_missing is True
        new = session.get(Track, file_id)
        assert new is not None
        assert new.rel_path == "one.flac"
