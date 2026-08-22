"""Prepare HTTP tag check: unknown 400, source 200, listed profile ok."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from starlette.requests import Request

from musicweb.routes.media import PrepareRequest, transcode_prepare
from musicweb.transcode.profiles import DEFAULT_PROFILE_TAG


def _request() -> Request:
    app = FastAPI()
    app.state.library = SimpleNamespace()
    app.state.transcoder = SimpleNamespace(drop_pending_prewarm=lambda: None)
    app.state.settings = SimpleNamespace(diag_dir=None)
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/transcode/prepare",
        "raw_path": b"/api/transcode/prepare",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
        "app": app,
    }
    return Request(scope)


def test_unknown_tag_is_400(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "musicweb.routes.media.enqueue_prepare",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("enqueue")),
    )
    with pytest.raises(HTTPException) as exc:
        transcode_prepare(
            _request(),
            PrepareRequest(ids=["t1"], codec="not_a_profile"),
            db=None,
        )
    assert exc.value.status_code == 400


def test_source_tag_is_200_and_enqueues(monkeypatch: pytest.MonkeyPatch):
    counts = {"queued": 0, "already": 0, "ready": 0, "skipped": 3}
    seen: list[str] = []

    def fake_enqueue(_db, _lib, _tc, ids, *, profile_tag, urgent=False, tier="playlist"):
        seen.append(profile_tag)
        return counts

    monkeypatch.setattr("musicweb.routes.media.enqueue_prepare", fake_enqueue)
    result = transcode_prepare(
        _request(),
        PrepareRequest(ids=["a", "b", "c"], codec="source"),
        db=None,
    )
    assert result == counts
    assert seen == ["source"]


def test_listed_profile_does_not_400_on_tag(monkeypatch: pytest.MonkeyPatch):
    counts = {"queued": 1, "already": 0, "ready": 0, "skipped": 0}

    def fake_enqueue(_db, _lib, _tc, ids, *, profile_tag, urgent=False, tier="playlist"):
        return counts

    monkeypatch.setattr("musicweb.routes.media.enqueue_prepare", fake_enqueue)
    result = transcode_prepare(
        _request(),
        PrepareRequest(ids=["t1"], codec=DEFAULT_PROFILE_TAG),
        db=None,
    )
    assert result == counts


def test_radio_and_unknown_tier_are_400(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "musicweb.routes.media.enqueue_prepare",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("enqueue")),
    )
    for tier in ("radio", "nope"):
        with pytest.raises(HTTPException) as exc:
            transcode_prepare(
                _request(),
                PrepareRequest(ids=["t1"], codec=DEFAULT_PROFILE_TAG, tier=tier),
                db=None,
            )
        assert exc.value.status_code == 400


def test_download_tier_is_forwarded(monkeypatch: pytest.MonkeyPatch):
    seen: list[str] = []

    def fake_enqueue(_db, _lib, _tc, ids, *, profile_tag, urgent=False, tier="playlist"):
        seen.append(tier)
        return {"queued": 1, "already": 0, "ready": 0, "skipped": 0}

    monkeypatch.setattr("musicweb.routes.media.enqueue_prepare", fake_enqueue)
    transcode_prepare(
        _request(),
        PrepareRequest(ids=["t1"], codec=DEFAULT_PROFILE_TAG, tier="download"),
        db=None,
    )
    assert seen == ["download"]
