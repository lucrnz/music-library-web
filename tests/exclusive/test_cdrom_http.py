"""Companion /cdrom/file: jailed Range GET/HEAD, 401 token, 404 jail."""

from __future__ import annotations

import asyncio
from pathlib import Path
from urllib.parse import urlencode

from musicweb.exclusive.app import create_exclusive_app
from musicweb.exclusive.optical import StubOpticalPort
from musicweb.exclusive.optical_volume import VolumeMount
from musicweb.exclusive.session import ExclusiveHub


def _asgi(
    app,
    method: str,
    path: str,
    query: str = "",
    headers: dict[str, str] | None = None,
):
    async def run():
        status: dict[str, int] = {}
        out_headers: list[tuple[bytes, bytes]] = []
        chunks: list[bytes] = []

        async def receive():
            await asyncio.Event().wait()
            return {"type": "http.request", "body": b"", "more_body": False}

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
        decoded = {k.decode(): v.decode() for k, v in out_headers}
        return status.get("code", 0), decoded, b"".join(chunks)

    return asyncio.run(run())


def _cdrom_app(volume: Path, *, token: str = "secret") -> tuple[object, ExclusiveHub]:
    hub = ExclusiveHub(companion_token=token, data_dir=volume)
    hub.start_player = lambda: None  # type: ignore[method-assign]
    hub.stop = lambda: None  # type: ignore[method-assign]
    hub.optical.port = StubOpticalPort()
    hub.optical._install_mount(
        "dev-cd",
        VolumeMount(name="MYCD", path=volume, volume_id="vol-1"),
    )
    return create_exclusive_app(hub), hub


def _q(**fields: str) -> str:
    return urlencode(fields)


def test_range_and_head_original_bytes(tmp_path: Path):
    (tmp_path / "song.mp3").write_bytes(b"abcdefgh")
    app, _hub = _cdrom_app(tmp_path)
    code, headers, body = _asgi(
        app,
        "GET",
        "/cdrom/file",
        _q(device="dev-cd", rel="song.mp3", token="secret"),
        headers={"range": "bytes=0-2"},
    )
    assert code == 206
    assert body == b"abc"
    assert "bytes 0-2/8" in headers.get("content-range", "")
    assert headers.get("accept-ranges") == "bytes"
    assert headers.get("content-type", "").startswith("audio/mpeg")

    code, headers, body = _asgi(
        app,
        "HEAD",
        "/cdrom/file",
        _q(device="dev-cd", rel="song.mp3", token="secret"),
    )
    assert code == 200
    assert body == b""
    assert headers.get("content-length") == "8"

    code, _, body = _asgi(
        app,
        "GET",
        "/cdrom/file",
        _q(device="dev-cd", rel="song.mp3", token="secret"),
    )
    assert code == 200
    assert body == b"abcdefgh"


def test_bad_token_is_401(tmp_path: Path):
    (tmp_path / "song.mp3").write_bytes(b"x")
    app, _hub = _cdrom_app(tmp_path)
    code, _, _ = _asgi(
        app,
        "GET",
        "/cdrom/file",
        _q(device="dev-cd", rel="song.mp3", token="nope"),
    )
    assert code == 401
    code, _, _ = _asgi(
        app, "GET", "/cdrom/file", _q(device="dev-cd", rel="song.mp3")
    )
    assert code == 401


def test_missing_device_is_404(tmp_path: Path):
    (tmp_path / "song.mp3").write_bytes(b"x")
    app, _hub = _cdrom_app(tmp_path)
    code, _, _ = _asgi(
        app,
        "GET",
        "/cdrom/file",
        _q(device="other", rel="song.mp3", token="secret"),
    )
    assert code == 404
    code, _, _ = _asgi(
        app, "GET", "/cdrom/file", _q(rel="song.mp3", token="secret")
    )
    assert code == 404


def test_escape_rel_is_404(tmp_path: Path):
    (tmp_path / "song.mp3").write_bytes(b"x")
    app, _hub = _cdrom_app(tmp_path)
    code, _, _ = _asgi(
        app,
        "GET",
        "/cdrom/file",
        _q(device="dev-cd", rel="../etc/passwd", token="secret"),
    )
    assert code == 404


def test_non_allowlisted_extension_is_404(tmp_path: Path):
    (tmp_path / "notes.txt").write_bytes(b"nope")
    (tmp_path / "clip.ogg").write_bytes(b"ogg")
    app, _hub = _cdrom_app(tmp_path)
    code, _, _ = _asgi(
        app,
        "GET",
        "/cdrom/file",
        _q(device="dev-cd", rel="notes.txt", token="secret"),
    )
    assert code == 404
    code, _, _ = _asgi(
        app,
        "GET",
        "/cdrom/file",
        _q(device="dev-cd", rel="clip.ogg", token="secret"),
    )
    assert code == 404


def test_stub_port_without_mount_is_404(tmp_path: Path):
    (tmp_path / "song.mp3").write_bytes(b"x")
    hub = ExclusiveHub(companion_token="secret", data_dir=tmp_path)
    hub.start_player = lambda: None  # type: ignore[method-assign]
    hub.stop = lambda: None  # type: ignore[method-assign]
    app = create_exclusive_app(hub)
    code, _, _ = _asgi(
        app,
        "GET",
        "/cdrom/file",
        _q(device="dev-cd", rel="song.mp3", token="secret"),
    )
    assert code == 404


def test_cover_and_lyrics_jail_404(tmp_path: Path):
    (tmp_path / "song.mp3").write_bytes(b"x")
    app, _hub = _cdrom_app(tmp_path)
    for path in ("/cdrom/cover", "/cdrom/lyrics"):
        code, _, _ = _asgi(
            app,
            "GET",
            path,
            _q(device="dev-cd", rel="../etc/passwd", token="secret"),
        )
        assert code == 404
        code, _, _ = _asgi(
            app, "GET", path, _q(device="dev-cd", rel="song.mp3", token="nope")
        )
        assert code == 401


def test_cover_folder_image_and_lyrics_sidecar(tmp_path: Path):
    (tmp_path / "song.mp3").write_bytes(b"x")
    (tmp_path / "cover.jpg").write_bytes(b"\xff\xd8folder")
    (tmp_path / "song.lrc").write_text("[00:01.00]hi\n", encoding="utf-8")
    app, _hub = _cdrom_app(tmp_path)
    from unittest.mock import patch

    with patch("musicweb.cover._extract_embedded", return_value=False):
        code, headers, body = _asgi(
            app,
            "GET",
            "/cdrom/cover",
            _q(device="dev-cd", rel="song.mp3", token="secret"),
        )
    assert code == 200
    assert body == b"\xff\xd8folder"
    assert headers.get("content-type", "").startswith("image/")

    code, _, body = _asgi(
        app,
        "GET",
        "/cdrom/lyrics",
        _q(device="dev-cd", rel="song.mp3", token="secret"),
    )
    assert code == 200
    assert b"hi" in body
    assert b"local_lrc" in body


def test_lyrics_missing_is_200_nulls(tmp_path: Path):
    import json

    (tmp_path / "song.mp3").write_bytes(b"x")
    app, _hub = _cdrom_app(tmp_path)
    code, _, body = _asgi(
        app,
        "GET",
        "/cdrom/lyrics",
        _q(device="dev-cd", rel="song.mp3", token="secret"),
    )
    assert code == 200
    payload = json.loads(body.decode())
    assert payload == {"plain": None, "synced": None, "source": None}


def test_cover_missing_is_404(tmp_path: Path):
    (tmp_path / "song.mp3").write_bytes(b"x")
    app, _hub = _cdrom_app(tmp_path)
    from unittest.mock import patch

    with patch("musicweb.cover._extract_embedded", return_value=False):
        code, _, _ = _asgi(
            app,
            "GET",
            "/cdrom/cover",
            _q(device="dev-cd", rel="song.mp3", token="secret"),
        )
    assert code == 404


def test_no_transcode_or_wav_wrapper(tmp_path: Path):
    payload = b"ID3\x04not-a-wav"
    (tmp_path / "song.mp3").write_bytes(payload)
    app, _hub = _cdrom_app(tmp_path)
    code, headers, body = _asgi(
        app,
        "GET",
        "/cdrom/file",
        _q(device="dev-cd", rel="song.mp3", token="secret"),
    )
    assert code == 200
    assert body == payload
    assert not headers.get("content-type", "").startswith("audio/wav")
