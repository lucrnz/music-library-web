"""blob_put resume: 206 continues; 200 rewrites from the start."""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from musicweb.exclusive import blob_store
from musicweb.exclusive.session import ExclusiveHub


class _IgnoreRange(BaseHTTPRequestHandler):
    body = b"abcdefgh"

    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Length", str(len(self.body)))
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *_args: object) -> None:
        return


class _HonorRange(BaseHTTPRequestHandler):
    body = b"abcdefgh"

    def do_GET(self) -> None:  # noqa: N802
        rng = self.headers.get("Range") or ""
        if rng.startswith("bytes="):
            start = int(rng.split("=", 1)[1].split("-", 1)[0] or "0")
            chunk = self.body[start:]
            self.send_response(206)
            self.send_header(
                "Content-Range",
                f"bytes {start}-{len(self.body) - 1}/{len(self.body)}",
            )
            self.send_header("Content-Length", str(len(chunk)))
            self.end_headers()
            self.wfile.write(chunk)
            return
        self.send_response(200)
        self.send_header("Content-Length", str(len(self.body)))
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *_args: object) -> None:
        return


def _serve(handler: type[BaseHTTPRequestHandler]) -> HTTPServer:
    httpd = HTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def test_resume_200_rewrites_from_start(tmp_path: Path):
    httpd = _serve(_IgnoreRange)
    try:
        port = httpd.server_address[1]
        hub = ExclusiveHub(companion_token="x", data_dir=tmp_path)
        blob_store.append_chunk(tmp_path, "audio/a.bin", b"xx", offset=0)
        n = hub._fetch_url_to_blob(
            f"http://127.0.0.1:{port}/f",
            "audio/a.bin",
            2,
            threading.Event(),
            lambda *_args: None,
        )
        assert n == 8
        assert blob_store.open_read(tmp_path, "audio/a.bin").read_bytes() == b"abcdefgh"
    finally:
        httpd.shutdown()


def test_offset_zero_truncates_longer_partial(tmp_path: Path):
    httpd = _serve(_IgnoreRange)
    try:
        port = httpd.server_address[1]
        hub = ExclusiveHub(companion_token="x", data_dir=tmp_path)
        blob_store.append_chunk(tmp_path, "audio/a.bin", b"xxxxxxxxxx", offset=0)
        n = hub._fetch_url_to_blob(
            f"http://127.0.0.1:{port}/f",
            "audio/a.bin",
            0,
            threading.Event(),
            lambda *_args: None,
        )
        assert n == 8
        assert blob_store.open_read(tmp_path, "audio/a.bin").read_bytes() == b"abcdefgh"
    finally:
        httpd.shutdown()


def test_resume_206_appends(tmp_path: Path):
    httpd = _serve(_HonorRange)
    try:
        port = httpd.server_address[1]
        hub = ExclusiveHub(companion_token="x", data_dir=tmp_path)
        blob_store.append_chunk(tmp_path, "audio/a.bin", b"ab", offset=0)
        n = hub._fetch_url_to_blob(
            f"http://127.0.0.1:{port}/f",
            "audio/a.bin",
            2,
            threading.Event(),
            lambda *_args: None,
        )
        assert n == 8
        assert blob_store.open_read(tmp_path, "audio/a.bin").read_bytes() == b"abcdefgh"
    finally:
        httpd.shutdown()
