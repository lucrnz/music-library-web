"""Stream/prepare emit cutoff and worker isolation."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from starlette.requests import Request

from musicweb.diag.emit import emit


def _request(
    tmp_path: Path,
    *,
    headers: dict[str, str] | None = None,
    cookies: dict[str, str] | None = None,
) -> Request:
    app = FastAPI()
    app.state.settings = SimpleNamespace(diag_dir=tmp_path)
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


def test_http_stream_info_dropped_without_everything(tmp_path: Path):
    req = _request(tmp_path, cookies={"musicweb_mode": "errors"})
    emit(
        req,
        "http.stream",
        level="info",
        data={"track_id": "t1", "codec": "opus_192_48000", "plan": "encode"},
    )
    assert _lines(tmp_path) == []


def test_http_stream_info_when_everything(tmp_path: Path):
    req = _request(tmp_path, headers={"X-Musicweb-Mode": "everything"})
    emit(
        req,
        "http.stream",
        level="info",
        data={"track_id": "t1", "codec": "opus_192_48000", "plan": "passthrough"},
    )
    lines = _lines(tmp_path)
    assert len(lines) == 1
    assert lines[0]["event"] == "http.stream"
    assert lines[0]["data"]["plan"] == "passthrough"


def test_http_stream_reject_always_written(tmp_path: Path):
    req = _request(tmp_path)
    emit(
        req,
        "http.stream.reject",
        level="error",
        data={
            "track_id": "missing",
            "play_source": "streaming",
            "profile": "opus_192_48000",
            "reason": "Track not found",
            "connectivity": None,
            "codec": "opus_192_48000",
            "status": 404,
            "detail": "Track not found",
        },
    )
    lines = _lines(tmp_path)
    assert len(lines) == 1
    assert lines[0]["event"] == "http.stream.reject"
    assert lines[0]["level"] == "error"
    assert lines[0]["data"]["track_id"] == "missing"
    assert "status" in lines[0]["data"]


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
