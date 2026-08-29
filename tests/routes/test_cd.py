"""CD identify/confirm/get routes (no TestClient)."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from musicweb.cd.identify import TocIn
from musicweb.db.models import CdIdentity
from musicweb.routes.cd import ConfirmIn, IdentifyIn, get_identity, post_confirm, post_identify

TOC = TocIn(first_track=1, last_audio_track=2, leadout_lba=15000, offsets=[0, 7500])
UA = "MusicLibaryWeb/0.1 - test@example.com"


class FakeCover:
    def write_from_bytes(self, album_id: str, source: bytes) -> bool:
        return bool(source)


class _Settings:
    def musicbrainz_user_agent(self):
        return UA


def _request(cover=None):
    return SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                settings=_Settings(),
                cover_store=cover or FakeCover(),
            )
        )
    )


def test_identify_route_lookup_only(db, monkeypatch):
    monkeypatch.setattr(
        "musicweb.routes.cd.lookup",
        lambda *a, **k: {
            "discid": "x",
            "matches": [{"release_mbid": "r1"}],
            "applied": None,
            "cd_text": None,
        },
    )
    with db.session() as session:
        out = post_identify(
            IdentifyIn(toc=TOC.__dict__, cd_text=None),
            _request(),
            db=session,
        )
        session.commit()
        assert out["matches"][0]["release_mbid"] == "r1"
        assert session.scalar(__import__("sqlalchemy").select(__import__("sqlalchemy").func.count()).select_from(CdIdentity)) == 0


def test_get_unknown_404(db):
    with db.session() as session:
        with pytest.raises(HTTPException) as exc:
            get_identity("nope", _request(), db=session)
        assert exc.value.status_code == 404


def test_confirm_route_returns_dto(db, monkeypatch):
    dto = {
        "discid": "d1",
        "release_mbid": "mb-r",
        "album_id": "alb",
        "album": "Demo",
        "artist": "Band",
        "year": 2000,
        "has_cover": False,
        "tracks": [{"id": "t1", "track_no": 1, "title": "One", "artist": "A", "duration_ms": 1}],
    }
    monkeypatch.setattr("musicweb.routes.cd.confirm", lambda *a, **k: dto)
    monkeypatch.setattr("musicweb.routes.cd.get_applied", lambda *a, **k: dto)
    with db.session() as session:
        out = post_confirm(
            ConfirmIn(discid="d1", release_mbid="mb-r", toc=TOC.__dict__),
            _request(),
            db=session,
        )
        assert out["tracks"][0]["id"] == "t1"
        got = get_identity("d1", _request(), db=session)
        assert got == dto