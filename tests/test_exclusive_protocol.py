"""Exclusive companion protocol helpers."""

import pytest

from musicweb.exclusive.protocol import (
    MSG_BLOB_PUT,
    MSG_DISK_INFO_OK,
    MSG_RELEASE_DEVICE,
    PROTOCOL_VERSION,
    envelope,
    parse_message,
    require_http_url,
    token_ok,
)


def test_envelope_version_and_type():
    msg = envelope("hello", token="x", sessionId="s1")
    assert msg["v"] == PROTOCOL_VERSION
    assert msg["type"] == "hello"
    assert msg["token"] == "x"


def test_blob_type_constants():
    assert MSG_BLOB_PUT == "blob_put"
    assert MSG_DISK_INFO_OK == "disk_info_ok"
    assert MSG_RELEASE_DEVICE == "release_device"


def test_token_ok():
    assert token_ok("secret", "secret") is True
    assert token_ok("nope", "secret") is False
    assert token_ok("", "secret") is False
    assert token_ok("secret", "") is False


def test_require_http_url():
    assert require_http_url("https://nas.local/a") == "https://nas.local/a"
    with pytest.raises(ValueError):
        require_http_url("file:///etc/passwd")
    with pytest.raises(ValueError):
        require_http_url("/api/stream")


def test_parse_rejects_bad_version():
    assert parse_message({"v": 999, "type": "hello"}) is None
    assert parse_message({"type": "hello"}) is None
    assert parse_message("nope") is None
    assert parse_message({"v": PROTOCOL_VERSION, "type": "heartbeat"}) is not None
