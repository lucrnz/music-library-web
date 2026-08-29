"""mark_missing and recount_entities."""

from musicweb.db.models import Album, Artist, Track
from musicweb.scan.finalize import mark_missing, recount_entities


def _artist(session, artist_id: str = "art") -> Artist:
    row = session.get(Artist, artist_id)
    if row is None:
        row = Artist(
            id=artist_id,
            name="Artist",
            name_norm="artist",
            sort_name="artist",
            album_count=0,
            track_count=0,
        )
        session.add(row)
        session.flush()
    return row


def _album(session, album_id: str = "alb") -> Album:
    _artist(session)
    row = session.get(Album, album_id)
    if row is None:
        row = Album(
            id=album_id,
            artist_id="art",
            title="Album",
            title_norm="album",
            track_count=0,
            has_cover=False,
        )
        session.add(row)
        session.flush()
    return row


def _track(
    session,
    *,
    track_id: str,
    rel_path: str | None,
    source_codec: str | None,
    is_lossy: bool,
    is_missing: bool = False,
    duration_ms: int | None = None,
) -> Track:
    _album(session)
    track = Track(
        id=track_id,
        fingerprint=f"fp-{track_id}",
        fingerprint_algo="sha256",
        rel_path=None if is_missing else rel_path,
        title=track_id,
        artist_name="Artist",
        album_artist_name="Artist",
        artist_id="art",
        album_id="alb",
        album_artist_id="art",
        source_codec=source_codec,
        is_lossy=is_lossy,
        duration_ms=duration_ms,
        size_bytes=1,
        mtime_ns=1,
        is_missing=is_missing,
        added_at="t",
        indexed_at="t",
    )
    session.add(track)
    session.flush()
    return track


def test_mark_missing_unseen_and_empty_set(db):
    with db.session() as session:
        _track(
            session,
            track_id="t1",
            rel_path="a.flac",
            source_codec="flac",
            is_lossy=False,
        )
        _track(
            session,
            track_id="t2",
            rel_path="b.flac",
            source_codec="flac",
            is_lossy=False,
        )
        n = mark_missing(session, {"a.flac"})
        session.commit()
        assert n == 1
        assert session.get(Track, "t1").is_missing is False
        t2 = session.get(Track, "t2")
        assert t2.is_missing is True
        assert t2.rel_path is None

    with db.session() as session:
        n = mark_missing(session, set())
        session.commit()
        assert n == 1
        t1 = session.get(Track, "t1")
        assert t1.is_missing is True
        assert t1.rel_path is None


def test_mark_missing_does_not_touch_unripped_stub(db):
    with db.session() as session:
        _album(session)
        session.add(
            Track(
                id="cd-1",
                fingerprint="disc:1",
                fingerprint_algo="cd-discid",
                rel_path=None,
                title="Stub",
                artist_name="Artist",
                album_artist_name="Artist",
                artist_id="art",
                album_id="alb",
                album_artist_id="art",
                size_bytes=0,
                mtime_ns=0,
                is_missing=True,
                unripped=True,
                added_at="t",
                indexed_at="t",
            )
        )
        session.flush()
        n = mark_missing(session, set())
        session.commit()
        stub = session.get(Track, "cd-1")
        assert stub is not None
        assert stub.unripped is True
        assert stub.is_missing is True
        assert stub.rel_path is None
        assert n == 0


def test_recount_lossless_plus_mp3(db):
    with db.session() as session:
        _track(
            session,
            track_id="lossless",
            rel_path="a.flac",
            source_codec="flac",
            is_lossy=False,
        )
        _track(
            session,
            track_id="mp3",
            rel_path="a.mp3",
            source_codec="mp3",
            is_lossy=True,
        )
        recount_entities(session)
        session.commit()
        album = session.get(Album, "alb")
        artist = session.get(Artist, "art")
        assert album.track_count == 2
        assert album.lossy_kind == "mp3"
        assert artist.track_count == 2
        assert artist.album_count == 1


def test_recount_mixed_mp3_aac(db):
    with db.session() as session:
        _track(
            session,
            track_id="mp3",
            rel_path="a.mp3",
            source_codec="mp3",
            is_lossy=True,
        )
        _track(
            session,
            track_id="aac",
            rel_path="a.m4a",
            source_codec="aac",
            is_lossy=True,
        )
        recount_entities(session)
        session.commit()
        assert session.get(Album, "alb").lossy_kind == "mixed"


def test_recount_ignores_missing(db):
    with db.session() as session:
        _track(
            session,
            track_id="lossless",
            rel_path="a.flac",
            source_codec="flac",
            is_lossy=False,
        )
        _track(
            session,
            track_id="mp3",
            rel_path=None,
            source_codec="mp3",
            is_lossy=True,
            is_missing=True,
        )
        recount_entities(session)
        session.commit()
        album = session.get(Album, "alb")
        artist = session.get(Artist, "art")
        assert album.track_count == 1
        assert album.lossy_kind is None
        assert artist.track_count == 1


def test_recount_all_aac(db):
    with db.session() as session:
        _track(
            session,
            track_id="aac",
            rel_path="a.m4a",
            source_codec="aac",
            is_lossy=True,
        )
        recount_entities(session)
        session.commit()
        assert session.get(Album, "alb").lossy_kind == "aac"


def test_recount_unknown_lossy(db):
    with db.session() as session:
        _track(
            session,
            track_id="opus",
            rel_path="a.opus",
            source_codec="opus",
            is_lossy=True,
        )
        recount_entities(session)
        session.commit()
        assert session.get(Album, "alb").lossy_kind == "lossy"

    with db.session() as session:
        session.get(Track, "opus").source_codec = None
        recount_entities(session)
        session.commit()
        assert session.get(Album, "alb").lossy_kind == "lossy"


def test_recount_mp3_plus_unknown_is_mixed(db):
    with db.session() as session:
        _track(
            session,
            track_id="mp3",
            rel_path="a.mp3",
            source_codec="mp3",
            is_lossy=True,
        )
        _track(
            session,
            track_id="unk",
            rel_path="b.bin",
            source_codec=None,
            is_lossy=True,
        )
        recount_entities(session)
        session.commit()
        assert session.get(Album, "alb").lossy_kind == "mixed"


def test_recount_duration_sums_present_tracks(db):
    with db.session() as session:
        _track(
            session,
            track_id="t1",
            rel_path="a.flac",
            source_codec="flac",
            is_lossy=False,
            duration_ms=120_000,
        )
        _track(
            session,
            track_id="t2",
            rel_path="b.flac",
            source_codec="flac",
            is_lossy=False,
            duration_ms=180_000,
        )
        recount_entities(session)
        session.commit()
        assert session.get(Album, "alb").duration_ms == 300_000


def test_recount_duration_null_if_any_present_lacks_ms(db):
    with db.session() as session:
        _track(
            session,
            track_id="t1",
            rel_path="a.flac",
            source_codec="flac",
            is_lossy=False,
            duration_ms=120_000,
        )
        _track(
            session,
            track_id="t2",
            rel_path="b.flac",
            source_codec="flac",
            is_lossy=False,
            duration_ms=None,
        )
        recount_entities(session)
        session.commit()
        assert session.get(Album, "alb").duration_ms is None


def test_recount_duration_ignores_missing_tracks(db):
    with db.session() as session:
        _track(
            session,
            track_id="t1",
            rel_path="a.flac",
            source_codec="flac",
            is_lossy=False,
            duration_ms=120_000,
        )
        _track(
            session,
            track_id="t2",
            rel_path=None,
            source_codec="flac",
            is_lossy=False,
            is_missing=True,
            duration_ms=None,
        )
        recount_entities(session)
        session.commit()
        assert session.get(Album, "alb").duration_ms == 120_000


def test_recount_duration_null_when_no_present_tracks(db):
    with db.session() as session:
        _album(session)
        recount_entities(session)
        session.commit()
        assert session.get(Album, "alb").duration_ms is None
