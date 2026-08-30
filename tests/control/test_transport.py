"""Control plane transport: UDS (POSIX) and loopback TCP."""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from musicweb.control.client import ControlClient, ControlError
from musicweb.control.endpoint import parse_tcp_endpoint, write_tcp_endpoint
from musicweb.control.server import ControlServer


def _server(data_dir, *, transport: str) -> ControlServer:
    return ControlServer(data_dir, jobs=SimpleNamespace(), transport=transport)


def test_tcp_health_roundtrip(tmp_home):
    server = _server(tmp_home.data, transport="tcp")
    server.start()
    try:
        assert ControlClient(tmp_home.data).health() is True
    finally:
        server.stop()
    assert ControlClient(tmp_home.data).health() is False


@pytest.mark.skipif(sys.platform == "win32", reason="Unix sockets unavailable")
def test_uds_health_roundtrip():
    # AF_UNIX paths are short; pytest's tmp dir is often too long.
    data = Path("/tmp") / f"mwc-uds-{os.getpid()}"
    if data.exists():
        shutil.rmtree(data)
    data.mkdir()
    try:
        server = _server(data, transport="uds")
        server.start()
        try:
            assert ControlClient(data).health() is True
        finally:
            server.stop()
        assert ControlClient(data).health() is False
    finally:
        shutil.rmtree(data, ignore_errors=True)


@pytest.mark.skipif(sys.platform != "win32", reason="UDS reject is Windows-only")
def test_uds_rejected_on_win32(tmp_home):
    with pytest.raises(RuntimeError, match="not available"):
        _server(tmp_home.data, transport="uds")


def test_parse_tcp_endpoint_accepts_loopback(tmp_path):
    path = tmp_path / "musicweb.control"
    write_tcp_endpoint(path, "127.0.0.1", 1234)
    assert parse_tcp_endpoint(path) == ("127.0.0.1", 1234)


def test_parse_tcp_endpoint_rejects_non_loopback(tmp_path):
    path = tmp_path / "musicweb.control"
    path.write_text("0.0.0.0:1\n", encoding="utf-8")
    with pytest.raises(ValueError, match="loopback"):
        parse_tcp_endpoint(path)


def test_parse_tcp_endpoint_rejects_garbage(tmp_path):
    path = tmp_path / "musicweb.control"
    path.write_text("not-an-endpoint\n", encoding="utf-8")
    with pytest.raises(ValueError):
        parse_tcp_endpoint(path)


def test_missing_endpoint_raises(tmp_home):
    with pytest.raises(ControlError, match="missing"):
        ControlClient(tmp_home.data)._call("health")
