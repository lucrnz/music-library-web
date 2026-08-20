"""Radio WS payload allowlist and codec checks."""

from musicweb.radio.protocol import (
    ACTION_CLOSE,
    ACTION_TUNE_IN,
    ACTION_TUNE_OUT,
    client_payload_action,
    is_browser_listed_profile,
    parse_client_payload,
)


def test_unknown_payload_closes():
    assert client_payload_action(None) == ACTION_CLOSE
    assert client_payload_action("") == ACTION_CLOSE
    assert client_payload_action("{}") == ACTION_CLOSE
    assert client_payload_action('{"type":"hello"}') == ACTION_CLOSE
    assert client_payload_action(b"ping") == ACTION_CLOSE


def test_tune_in_and_tune_out_are_allowlisted():
    action, fields = parse_client_payload(
        '{"type":"tune_in","codec":"opus_192_48000"}'
    )
    assert action == ACTION_TUNE_IN
    assert fields["codec"] == "opus_192_48000"
    assert parse_client_payload('{"type":"tune_out"}')[0] == ACTION_TUNE_OUT


def test_browser_listed_profile_only():
    assert is_browser_listed_profile("opus_192_48000") is True
    assert is_browser_listed_profile("flac_16_44100") is True
    assert is_browser_listed_profile("source") is False
    assert is_browser_listed_profile("flac_24_192000") is False
    assert is_browser_listed_profile("not_a_profile") is False
    assert is_browser_listed_profile(None) is False

