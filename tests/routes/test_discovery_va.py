"""VA discovery: list, 404 album-less, search aliases, track browsable."""

from fastapi import HTTPException

from sqlalchemy import select

from musicweb.db.models import Track
from musicweb.db.va import VA_ARTIST_ID, VA_DISPLAY_NAME
from musicweb.routes import discovery
from musicweb.scan.finalize import recount_entities
from musicweb.scan.identity import apply_track_fields, resolve_track
from musicweb.db.names import track_id_for
from musicweb.metadata import TrackMetadata
from pathlib import Path


def _meta(**overrides) -> TrackMetadata:
    values = dict(
        title="Song",
        artist="Nirvana",
        album="Nevermind",
        albumartist="Nirvana",
        track=1,
        disc=1,
        year=1991,
        duration=301.0,
        sample_rate_hz=44100,
        bit_depth=16,
        channels=2,
        source_codec="flac",
        bitrate_kbps=None,
    )
    values.update(overrides)
    return TrackMetadata(**values)


def _index(db, tmp_path, *, fp: str, rel: str, meta: TrackMetadata) -> str:
    path = tmp_path / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x")
    tid = track_id_for("sha256", fp)
    with db.session() as session:
        track = resolve_track(
            session,
            fingerprint=fp,
            fingerprint_algo="sha256",
            track_id=tid,
            rel_path=rel,
            existing_by_path=None,
            now="t0",
        )
        apply_track_fields(
            session,
            track,
            path=Path(path),
            size=1,
            mtime_ns=1,
            meta=meta,
            now="t1",
        )
        recount_entities(session)
        session.commit()
    return tid


def test_list_includes_va_not_guest(db, tmp_path):
    _index(
        db,
        tmp_path,
        fp="va1",
        rel="comp/a.flac",
        meta=_meta(album="Grunge Box", albumartist="Various Artists", artist="Joe Nobody"),
    )
    _index(
        db,
        tmp_path,
        fp="nirv",
        rel="nevermind/a.flac",
        meta=_meta(),
    )
    with db.session() as session:
        body = discovery.list_artists(offset=0, limit=100, db=session)
        names = {a["name"] for a in body["items"]}
        assert VA_DISPLAY_NAME in names
        assert "Joe Nobody" not in names
        assert "Nirvana" in names


def test_get_artist_404_when_album_less(db, tmp_path):
    _index(
        db,
        tmp_path,
        fp="va1",
        rel="comp/a.flac",
        meta=_meta(album="Grunge Box", albumartist="VA", artist="Joe Nobody"),
    )
    with db.session() as session:
        guest = session.scalars(select(Track).where(Track.title == "Song")).one()
        guest_id = guest.artist_id
        try:
            discovery.get_artist(guest_id, db=session)
            raise AssertionError("expected 404")
        except HTTPException as exc:
            assert exc.status_code == 404
        va = discovery.get_artist(VA_ARTIST_ID, db=session)
        assert va["name"] == VA_DISPLAY_NAME
        assert va["is_va"] is True


def test_search_alias_returns_va_and_guest_tracks(db, tmp_path):
    tid = _index(
        db,
        tmp_path,
        fp="va1",
        rel="comp/a.flac",
        meta=_meta(
            title="Teen Spirit",
            album="Grunge Box",
            albumartist="オムニバス",
            artist="Joe Nobody",
        ),
    )
    with db.session() as session:
        body = discovery.search(q="オムニバス", limit=50, db=session)
        assert [a["id"] for a in body["artists"]] == [VA_ARTIST_ID]
        guest_search = discovery.search(q="Joe Nobody", limit=50, db=session)
        assert guest_search["artists"] == []
        assert any(t["id"] == tid for t in guest_search["tracks"])
        assert guest_search["tracks"][0]["artist_browsable"] is False


def test_owned_artist_on_va_track_is_browsable(db, tmp_path):
    _index(db, tmp_path, fp="own", rel="nevermind/a.flac", meta=_meta())
    tid = _index(
        db,
        tmp_path,
        fp="va1",
        rel="comp/a.flac",
        meta=_meta(album="Grunge Box", albumartist="Various Artists", artist="Nirvana"),
    )
    with db.session() as session:
        body = discovery.get_track(tid, db=session)
        assert body["artist_browsable"] is True
        assert body["artist"] == "Nirvana"
        assert body["album_artist"] == VA_DISPLAY_NAME
