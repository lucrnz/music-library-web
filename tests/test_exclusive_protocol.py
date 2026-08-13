"""Exclusive companion protocol helpers."""

from musicweb.exclusive.protocol import (
    PROTOCOL_VERSION,
    envelope,
    parse_message,
)


def test_envelope_version_and_type():
    msg = envelope("hello", token="x", sessionId="s1")
    assert msg["v"] == PROTOCOL_VERSION
    assert msg["type"] == "hello"
    assert msg["token"] == "x"


def test_parse_rejects_bad_version():
    assert parse_message({"v": 999, "type": "hello"}) is None
    assert parse_message({"type": "hello"}) is None
    assert parse_message("nope") is None
    assert parse_message({"v": PROTOCOL_VERSION, "type": "heartbeat"}) is not None
