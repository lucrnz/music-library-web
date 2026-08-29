"""Identify is lookup-only; confirm binds or stubs and returns a snapshot."""

from __future__ import annotations

from sqlalchemy import func, select

from musicweb.cd.identify import TocIn, compute_discid, confirm, get_applied, lookup
from musicweb.db.models import CdIdentity, Track
from musicweb.db.repositories import tracks as tracks_repo
from musicweb.scan.identity import ensure_album, ensure_artist

TOC = TocIn(first_track=1, last_audio_track=2, leadout_lba=15000, offsets=[0, 7500])
DISCID = compute_discid(TOC)
UA = "MusicLibaryWeb/0.1 - test@example.com"


class FakeHttp:
    def __init__(
        self,
        releases: list[dict] | None = None,
        release_by_id: dict[str, dict] | None = None,
        cover: bytes | None = None,
    ) -> None:
        self.releases = releases or []
        self.release_by_id = release_by_id or {}
        self.cover = cover
        self.calls: list[str] = []

    def get_json(self, url: str, *, user_agent=None, max_bytes=0):
        self.calls.append(url)
        if "/discid/" in url:
            return 200, {"releases": list(self.releases)}
        if "/release/" in url:
            mbid = url.rsplit("/", 1)[-1].split("?")[0]
            payload = self.release_by_id.get(mbid)
            if payload is None:
                return 404, None
            return 200, payload
        return 404, None

    def get_bytes(self, url: str, *, user_agent=None, accept="*/*", max_bytes=0):
        self.calls.append(url)
        if self.cover:
            return 200, self.cover, "image/jpeg"
        return 404, b"", None


class FakeCover:
    def __init__(self) -> None:
        self.written: dict[str, bytes] = {}

    def write_from_bytes(self, album_id: str, source: bytes) -> bool:
        if not source:
            return False
        self.written[album_id] = source
        return True


def _release(mbid: str, title: str = "Demo", artist: str = "Band") -> dict:
    return {
        "id": mbid,
        "title": title,
        "date": "2000-05-02",
        "country": "DE",
        "artist-credit": [{"name": artist, "joinphrase": ""}],
        "label-info": [{"label": {"name": "BMG"}}],
        "media": [
            {
                "track-count": 2,
                "tracks": [
                    {
                        "number": "1",
                        "title": "One",
                        "length": 100000,
                    },
                    {
                        "number": "2",
                        "title": "Two",
                        "length": 100000,
                    },
                ],
            }
        ],
    }


def _count(session, model) -> int:
    return int(session.scalar(select(func.count()).select_from(model)) or 0)


def test_lookup_unique_writes_nothing(db):
    http = FakeHttp(releases=[_release("mb-1")])
    with db.session() as session:
        before = _count(session, Track)
        out = lookup(session, toc=TOC, cd_text=None, user_agent=UA, http=http)
        session.commit()
        assert len(out["matches"]) == 1
        assert out["matches"][0]["release_mbid"] == "mb-1"
        assert out["applied"] is None
        assert _count(session, Track) == before
        assert _count(session, CdIdentity) == 0


def test_lookup_several_and_zero_and_no_email(db):
    http = FakeHttp(releases=[_release("a"), _release("b", title="Other")])
    with db.session() as session:
        several = lookup(session, toc=TOC, cd_text=None, user_agent=UA, http=http)
        none = lookup(session, toc=TOC, cd_text={"album": "X"}, user_agent=None, http=http)
        zero_http = FakeHttp(releases=[])
        zero = lookup(session, toc=TOC, cd_text=None, user_agent=UA, http=zero_http)
        session.commit()
        assert len(several["matches"]) == 2
        assert none["matches"] == []
        assert zero["matches"] == []
        assert _count(session, CdIdentity) == 0


def test_confirm_unripped_returns_snapshot(db):
    rel = _release("mb-hide")
    http = FakeHttp(
        releases=[rel],
        release_by_id={"mb-hide": rel},
        cover=b"\xff\xd8\xff" + b"x" * 32,
    )
    cover = FakeCover()
    with db.session() as session:
        dto = confirm(
            session,
            discid=DISCID,
            release_mbid="mb-hide",
            toc=TOC,
            user_agent=UA,
            cover_store=cover,
            http=http,
        )
        session.commit()
        assert dto["release_mbid"] == "mb-hide"
        assert dto["album"] == "Demo"
        assert dto["artist"] == "Band"
        assert dto["year"] == 2000
        assert len(dto["tracks"]) == 2
        assert all(t["id"] for t in dto["tracks"])
        assert dto["has_cover"] is True
        stub = session.get(Track, dto["tracks"][0]["id"])
        assert stub is not None
        assert stub.fingerprint_algo == "cd-discid"
        assert stub.is_missing is True
        assert stub.unripped is True
        assert stub.rel_path is None
        assert stub.size_bytes == 0
        assert tracks_repo.count_missing(session) == 0
        broken = FakeHttp()

        def _boom(*_a, **_k):
            raise AssertionError("must not refetch MusicBrainz")

        broken.get_json = _boom  # type: ignore[method-assign]
        remembered = get_applied(session, DISCID, user_agent=UA, http=broken)
        assert remembered == dto
        again = lookup(session, toc=TOC, cd_text=None, user_agent=UA, http=broken)
        assert again["applied"] == dto
        assert again["matches"] == []


def test_confirm_bind_uses_library_ids(db):
    rel = _release("mb-bind", title="Owned", artist="Owner")
    http = FakeHttp(releases=[rel], release_by_id={"mb-bind": rel})
    with db.session() as session:
        artist = ensure_artist(session, "Owner")
        album = ensure_album(session, artist, "Owned", 2000)
        for n, title in ((1, "Lib One"), (2, "Lib Two")):
            session.add(
                Track(
                    id=f"lib-{n}",
                    fingerprint=f"sha-{n}",
                    fingerprint_algo="sha256",
                    rel_path=f"{n}.flac",
                    title=title,
                    artist_name="Owner",
                    album_artist_name="Owner",
                    artist_id=artist.id,
                    album_id=album.id,
                    album_artist_id=artist.id,
                    track_no=n,
                    disc_no=1,
                    size_bytes=1,
                    mtime_ns=1,
                    is_missing=False,
                    added_at="t",
                    indexed_at="t",
                )
            )
        session.flush()
        dto = confirm(
            session,
            discid=DISCID,
            release_mbid="mb-bind",
            toc=TOC,
            user_agent=UA,
            cover_store=FakeCover(),
            http=http,
        )
        session.commit()
        ids = {t["id"] for t in dto["tracks"]}
        assert ids == {"lib-1", "lib-2"}
        assert dto["album"] == "Owned"
        assert dto["artist"] == "Owner"
        assert (
            session.scalar(
                select(func.count())
                .select_from(Track)
                .where(Track.unripped.is_(True))
            )
            == 0
        )


def test_confirm_half_bind_reuses_present_slot(db):
    rel = _release("mb-half", title="Owned", artist="Owner")
    http = FakeHttp(releases=[rel], release_by_id={"mb-half": rel})
    with db.session() as session:
        artist = ensure_artist(session, "Owner")
        album = ensure_album(session, artist, "Owned", 2000)
        session.add(
            Track(
                id="lib-1",
                fingerprint="sha-1",
                fingerprint_algo="sha256",
                rel_path="1.flac",
                title="Lib One",
                artist_name="Owner",
                album_artist_name="Owner",
                artist_id=artist.id,
                album_id=album.id,
                album_artist_id=artist.id,
                track_no=1,
                disc_no=1,
                size_bytes=1,
                mtime_ns=1,
                is_missing=False,
                added_at="t",
                indexed_at="t",
            )
        )
        session.flush()
        dto = confirm(
            session,
            discid=DISCID,
            release_mbid="mb-half",
            toc=TOC,
            user_agent=UA,
            cover_store=FakeCover(),
            http=http,
        )
        session.commit()
        by_no = {t["track_no"]: t["id"] for t in dto["tracks"]}
        assert by_no[1] == "lib-1"
        hole = session.get(Track, by_no[2])
        assert hole is not None
        assert hole.unripped is True
        assert hole.is_missing is True


def test_confirm_does_not_overwrite_cover(db):
    rel = _release("mb-cover")
    http = FakeHttp(
        releases=[rel],
        release_by_id={"mb-cover": rel},
        cover=b"\xff\xd8\xff" + b"x" * 32,
    )
    cover = FakeCover()
    with db.session() as session:
        artist = ensure_artist(session, "Band")
        album = ensure_album(session, artist, "Demo", 2000)
        album.has_cover = True
        session.flush()
        dto = confirm(
            session,
            discid=DISCID,
            release_mbid="mb-cover",
            toc=TOC,
            user_agent=UA,
            cover_store=cover,
            http=http,
        )
        session.commit()
        assert dto["has_cover"] is True
        assert cover.written == {}


def test_get_unknown_is_none(db):
    with db.session() as session:
        assert get_applied(session, "missing", user_agent=UA, http=FakeHttp()) is None
