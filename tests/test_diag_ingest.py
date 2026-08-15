"""Ingest POST, emit cutoff, header/cookie join keys."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from starlette.requests import Request

from musicweb.diag.emit import emit
from musicweb.diag.envelope import envelope
from musicweb.diag.ids import from_request
from musicweb.routes.diag import ClientEvent, IngestBody, ingest_events


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
        "method": "POST",
        "scheme": "http",
        "path": "/api/diag/events",
        "raw_path": b"/api/diag/events",
        "query_string": b"",
        "headers": header_list,
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
        "app": app,
    }
    return Request(scope)


def _lines(directory: Path) -> list[dict]:
    files = sorted(directory.glob("events-*.jsonl"))
    out: list[dict] = []
    for path in files:
        for raw in path.read_text(encoding="utf-8").splitlines():
            if raw:
                out.append(json.loads(raw))
    return out


def test_ingest_204_forces_source_client(tmp_path: Path):
    req = _request(tmp_path)
    body = IngestBody(
        events=[
            ClientEvent(
                event="player.load.fail",
                level="error",
                data={"reason": "play_failed"},
            )
        ]
    )
    res = ingest_events(req, body)
    assert res.status_code == 204
    assert res.body == b""
    lines = _lines(tmp_path)
    assert len(lines) == 1
    assert lines[0]["source"] == "client"
    assert lines[0]["event"] == "player.load.fail"
    assert lines[0]["level"] == "error"
    assert lines[0]["data"] == {"reason": "play_failed"}
    assert "ts" in lines[0]


def test_ingest_body_source_field_ignored(tmp_path: Path):
    """Client cannot claim source=server; envelope always client."""
    req = _request(tmp_path)
    item = ClientEvent.model_validate(
        {
            "event": "player.load.fail",
            "source": "server",
            "level": "error",
        }
    )
    ingest_events(req, IngestBody(events=[item]))
    assert _lines(tmp_path)[0]["source"] == "client"


def test_ingest_101_events_400_no_write(tmp_path: Path):
    req = _request(tmp_path)
    events = [ClientEvent(event="player.load.fail") for _ in range(101)]
    with pytest.raises(HTTPException) as exc:
        ingest_events(req, IngestBody(events=events))
    assert exc.value.status_code == 400
    assert _lines(tmp_path) == []


def test_header_overrides_cookie(tmp_path: Path):
    req = _request(
        tmp_path,
        headers={"X-Musicweb-Client": "h", "X-Musicweb-Mode": "everything"},
        cookies={"musicweb_client": "c", "musicweb_mode": "errors"},
    )
    got = from_request(req)
    assert got.client_id == "h"
    assert got.mode == "everything"


def test_missing_mode_is_errors(tmp_path: Path):
    got = from_request(_request(tmp_path))
    assert got.mode == "errors"
    assert got.client_id is None


def test_emit_info_noop_without_everything(tmp_path: Path):
    req = _request(tmp_path)
    emit(req, "http.stream", level="info", data={"k": 1})
    assert _lines(tmp_path) == []
    emit(req, "http.stream.reject", level="error", data={"k": 1})
    lines = _lines(tmp_path)
    assert len(lines) == 1
    assert lines[0]["source"] == "server"
    assert lines[0]["event"] == "http.stream.reject"
    assert lines[0]["level"] == "error"


def test_emit_info_when_everything(tmp_path: Path):
    req = _request(
        tmp_path,
        headers={"X-Musicweb-Mode": "everything", "X-Musicweb-Client": "phone"},
    )
    emit(req, "http.stream", level="info", data={"k": 1})
    lines = _lines(tmp_path)
    assert len(lines) == 1
    assert lines[0]["event"] == "http.stream"
    assert lines[0]["client_id"] == "phone"
    assert lines[0]["level"] == "info"


def test_ingest_writes_info_even_when_mode_errors(tmp_path: Path):
    req = _request(tmp_path, cookies={"musicweb_mode": "errors"})
    res = ingest_events(
        req, IngestBody(events=[ClientEvent(event="diag.boot", level="info")])
    )
    assert res.status_code == 204
    lines = _lines(tmp_path)
    assert len(lines) == 1
    assert lines[0]["event"] == "diag.boot"
    assert lines[0]["level"] == "info"
    assert lines[0]["source"] == "client"


def test_emit_io_error_does_not_raise(tmp_path: Path):
    blocked = tmp_path / "not-a-dir"
    blocked.write_text("x", encoding="utf-8")
    emit(None, "http.stream.reject", level="error", store_dir=blocked)


def test_ingest_oversize_in_batch_writes_nothing(tmp_path: Path):
    req = _request(tmp_path)
    huge = {"pad": "x" * (8 * 1024 + 1)}
    body = IngestBody(
        events=[
            ClientEvent(event="player.load.fail", level="error"),
            ClientEvent(event="player.load.fail", level="error"),
            ClientEvent(event="player.load.fail", level="error"),
            ClientEvent(event="player.load.fail", level="error", data=huge),
        ]
    )
    with pytest.raises(HTTPException) as exc:
        ingest_events(req, body)
    assert exc.value.status_code == 400
    assert _lines(tmp_path) == []


def test_ingest_rotates_once_after_batch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    calls: list[Path] = []

    def spy(directory: Path, *, max_bytes: int | None = None) -> None:
        calls.append(directory)

    monkeypatch.setattr("musicweb.diag.store.maybe_rotate", spy)
    req = _request(tmp_path)
    body = IngestBody(
        events=[
            ClientEvent(event="player.load.fail", level="error"),
            ClientEvent(event="player.load.fail", level="error"),
            ClientEvent(event="player.load.fail", level="error"),
        ]
    )
    res = ingest_events(req, body)
    assert res.status_code == 204
    assert len(_lines(tmp_path)) == 3
    assert calls == [tmp_path]


def test_envelope_defaults():
    record = envelope(source="server", event="http.stream", level="nope", data="x")
    assert record["source"] == "server"
    assert record["event"] == "http.stream"
    assert record["level"] == "info"
    assert record["data"] == {}
    assert record["ts"].endswith("Z")


def test_envelope_keeps_parseable_ts():
    ts = "2026-08-15T12:00:00.000Z"
    record = envelope(source="client", event="diag.boot", ts=ts)
    assert record["ts"] == ts
    assert record["level"] == "info"
