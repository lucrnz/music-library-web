import asyncio
from pathlib import Path

from musicweb.exclusive.app import (
    CORS_HEADERS,
    create_exclusive_app,
    file_token_ok,
    parse_byte_range,
    read_file_span,
    slice_bytes,
)
from musicweb.exclusive import blob_store
from musicweb.exclusive.session import ExclusiveHub


def test_unauthorized_token():
    assert file_token_ok("", "secret") is False
    assert file_token_ok("nope", "secret") is False
    assert file_token_ok("secret", "secret") is True


def test_put_then_get(tmp_path: Path):
    assert blob_store.put_bytes(tmp_path, "audio/a.bin", b"abcd") == 4
    path = blob_store.open_read(tmp_path, "audio/a.bin")
    assert path.read_bytes() == b"abcd"


def test_range_first_byte():
    status, chunk, headers = slice_bytes(b"abcd", "bytes=0-0")
    assert status == 206
    assert chunk == b"a"
    assert headers["Content-Range"] == "bytes 0-0/4"


def test_missing_404(tmp_path: Path):
    try:
        blob_store.open_read(tmp_path, "audio/missing.bin")
    except FileNotFoundError:
        return
    raise AssertionError("expected missing")


def test_parse_range_and_span_read(tmp_path: Path):
    path = tmp_path / "big.bin"
    path.write_bytes(b"abcdefgh")
    assert parse_byte_range(None, 8) is None
    assert parse_byte_range("bytes=0-0", 8) == (0, 0)
    assert parse_byte_range("bytes=2-", 8) == (2, 7)
    assert parse_byte_range("bytes=-3", 8) == (5, 7)
    assert read_file_span(path, 0, 0) == b"a"
    assert read_file_span(path, 2, 4) == b"cde"


def test_parse_range_rejects_invalid():
    import pytest

    with pytest.raises(ValueError):
        parse_byte_range("bytes=foo", 8)
    with pytest.raises(ValueError):
        parse_byte_range("bytes=0-1,2-3", 8)
    with pytest.raises(ValueError):
        parse_byte_range("bytes=-3", 0)


def _asgi(
    app,
    method: str,
    path: str,
    query: str = "",
    headers: dict[str, str] | None = None,
    body: bytes = b"",
    body_chunks: tuple[bytes, ...] | None = None,
):
    async def run():
        status: dict[str, int] = {}
        out_headers: list[tuple[bytes, bytes]] = []
        chunks: list[bytes] = []
        if body_chunks is not None:
            incoming = list(body_chunks)
        elif body:
            incoming = [body]
        else:
            incoming = []
        idx = {"i": 0}

        async def receive():
            i = idx["i"]
            idx["i"] = i + 1
            if i >= len(incoming):
                # Stay connected so StreamingResponse does not abort the body.
                await asyncio.Event().wait()
            return {
                "type": "http.request",
                "body": incoming[i],
                "more_body": i + 1 < len(incoming),
            }

        async def send(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
                out_headers.extend(message.get("headers") or [])
            elif message["type"] == "http.response.body":
                chunks.append(message.get("body") or b"")

        hdrs = [
            (k.lower().encode(), v.encode())
            for k, v in (headers or {}).items()
        ]
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": query.encode(),
            "headers": hdrs,
            "client": ("127.0.0.1", 12345),
            "server": ("127.0.0.1", 18765),
        }
        await app(scope, receive, send)
        decoded = {
            k.decode(): v.decode() for k, v in out_headers
        }
        return status.get("code", 0), decoded, b"".join(chunks)

    return asyncio.run(run())


def _file_app(tmp_path: Path):
    hub = ExclusiveHub(companion_token="secret", data_dir=tmp_path)
    hub.start_player = lambda: None  # type: ignore[method-assign]
    hub.stop = lambda: None  # type: ignore[method-assign]
    return create_exclusive_app(hub)


def test_asgi_put_get_range_and_cors(tmp_path: Path):
    app = _file_app(tmp_path)
    code, headers, _ = _asgi(app, "OPTIONS", "/files/audio/a.bin", "token=secret")
    assert code == 204
    assert headers.get("access-control-allow-origin") == "*"
    assert headers.get("access-control-allow-private-network") == "true"

    code, _, body = _asgi(
        app, "PUT", "/files/audio/a.bin", "token=secret", body=b"abcd"
    )
    assert code == 200
    assert body

    code, headers, body = _asgi(
        app,
        "GET",
        "/files/audio/a.bin",
        "token=secret",
        headers={"range": "bytes=0-0"},
    )
    assert code == 206
    assert body == b"a"
    assert "bytes 0-0/4" in headers.get("content-range", "")
    assert headers.get("access-control-allow-origin") == "*"

    code, _, _ = _asgi(app, "GET", "/files/audio/a.bin")
    assert code == 401

    code, _, _ = _asgi(app, "HEAD", "/files/audio/a.bin", "token=secret")
    assert code == 200


def test_asgi_range_open_end_and_chunked_put(tmp_path: Path):
    app = _file_app(tmp_path)
    code, _, body = _asgi(
        app,
        "PUT",
        "/files/audio/b.bin",
        "token=secret",
        body=b"abcdefgh",
        body_chunks=(b"abcd", b"efgh"),
    )
    assert code == 200
    assert body
    code, headers, body = _asgi(
        app,
        "GET",
        "/files/audio/b.bin",
        "token=secret",
        headers={"range": "bytes=0-"},
    )
    assert code == 206
    assert body == b"abcdefgh"
    assert "bytes 0-7/8" in headers.get("content-range", "")


def test_asgi_invalid_range_416(tmp_path: Path):
    app = _file_app(tmp_path)
    _asgi(app, "PUT", "/files/audio/c.bin", "token=secret", body=b"abcd")
    code, _, _ = _asgi(
        app,
        "GET",
        "/files/audio/c.bin",
        "token=secret",
        headers={"range": "bytes=foo"},
    )
    assert code == 416


def test_cors_header_table():
    assert CORS_HEADERS["Access-Control-Allow-Origin"] == "*"
