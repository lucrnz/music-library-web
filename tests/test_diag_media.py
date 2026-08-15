"""Stream route emit cutoff, failure context, and worker isolation."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from starlette.requests import Request
from starlette.responses import FileResponse

from musicweb.routes.media import stream


def _request(
    tmp_path: Path,
    *,
    headers: dict[str, str] | None = None,
    cookies: dict[str, str] | None = None,
) -> Request:
    app = FastAPI()
    app.state.settings = SimpleNamespace(diag_dir=tmp_path)
    app.state.library = SimpleNamespace()
    header_list: list[tuple[bytes, bytes]] = []
    for key, value in (headers or {}).items():
        header_list.append((key.lower().encode("latin-1"), value.encode("latin-1")))
    if cookies:
        blob = "; ".join(f"{k}={v}" for k, v in cookies.items())
        header_list.append((b"cookie", blob.encode("latin-1")))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/stream",
        "raw_path": b"/api/stream",
        "query_string": b"",
        "headers": header_list,
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
        "app": app,
    }
    return Request(scope)


def _lines(directory: Path) -> list[dict]:
    out: list[dict] = []
    for path in sorted(directory.glob("events-*.jsonl")):
        for raw in path.read_text(encoding="utf-8").splitlines():
            if raw:
                out.append(json.loads(raw))
    return out


def _lossy_track() -> SimpleNamespace:
    return SimpleNamespace(
        is_lossy=True,
        is_missing=False,
        rel_path="song.mp3",
        source_codec="mp3",
    )


def test_stream_missing_track_writes_reject(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    req = _request(tmp_path)
    monkeypatch.setattr(
        "musicweb.routes.media.tracks_repo.get", lambda db, tid: None
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(stream(req, id="missing", codec="opus_192_48000", db=None))
    assert exc.value.status_code == 404
    lines = _lines(tmp_path)
    assert len(lines) == 1
    assert lines[0]["event"] == "http.stream.reject"
    assert lines[0]["level"] == "error"
    data = lines[0]["data"]
    assert data["track_id"] == "missing"
    assert data["play_source"] == "streaming"
    assert data["profile"] == "opus_192_48000"
    assert data["reason"] == "Track not found"
    assert data["connectivity"] is None
    assert data["status"] == 404
    assert data["detail"] == "Track not found"
    assert "codec" not in data


def test_stream_passthrough_everything_writes_info(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    audio = tmp_path / "song.mp3"
    audio.write_bytes(b"xx")
    req = _request(tmp_path, headers={"X-Musicweb-Mode": "everything"})
    monkeypatch.setattr(
        "musicweb.routes.media.tracks_repo.get", lambda db, tid: _lossy_track()
    )
    monkeypatch.setattr(
        "musicweb.routes.media._resolve_track_file", lambda lib, track: audio
    )
    res = asyncio.run(stream(req, id="t1", codec="source", db=None))
    assert isinstance(res, FileResponse)
    lines = _lines(tmp_path)
    assert len(lines) == 1
    assert lines[0]["event"] == "http.stream"
    assert lines[0]["level"] == "info"
    assert lines[0]["data"]["plan"] == "passthrough"
    assert lines[0]["data"]["track_id"] == "t1"


def test_stream_passthrough_errors_only_skips_info(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    audio = tmp_path / "song.mp3"
    audio.write_bytes(b"xx")
    req = _request(tmp_path, cookies={"musicweb_mode": "errors"})
    monkeypatch.setattr(
        "musicweb.routes.media.tracks_repo.get", lambda db, tid: _lossy_track()
    )
    monkeypatch.setattr(
        "musicweb.routes.media._resolve_track_file", lambda lib, track: audio
    )
    res = asyncio.run(stream(req, id="t1", codec="source", db=None))
    assert isinstance(res, FileResponse)
    assert _lines(tmp_path) == []


def test_worker_has_no_diag_import():
    from pathlib import Path as P

    text = (
        P(__file__).resolve().parents[1]
        / "src"
        / "musicweb"
        / "transcode"
        / "worker.py"
    ).read_text(encoding="utf-8")
    assert "musicweb.diag" not in text
    assert "diag.emit" not in text
    assert "emit(" not in text
