"""Reserved source passthrough vs encode vs reject."""

import pytest

from musicweb.transcode.passthrough import (
    SOURCE_TAG,
    can_encode,
    passthrough_media,
    stream_intent,
)
from musicweb.transcode.profiles import DEFAULT_PROFILE_TAG


def test_lossless_opus_encodes():
    intent = stream_intent(is_lossy=False, codec=DEFAULT_PROFILE_TAG)
    assert intent.kind == "encode"


def test_lossless_source_rejects():
    intent = stream_intent(is_lossy=False, codec=SOURCE_TAG)
    assert intent.kind == "reject"
    assert intent.status == 409


def test_lossy_source_passthrough():
    intent = stream_intent(is_lossy=True, codec=SOURCE_TAG)
    assert intent.kind == "passthrough"


def test_lossy_opus_rejects():
    intent = stream_intent(is_lossy=True, codec=DEFAULT_PROFILE_TAG)
    assert intent.kind == "reject"
    assert intent.status == 409


def test_unknown_tag_is_400():
    lossless = stream_intent(is_lossy=False, codec="src")
    lossy = stream_intent(is_lossy=True, codec="src")
    assert lossless.kind == "reject" and lossless.status == 400
    assert lossy.kind == "reject" and lossy.status == 400


def test_can_encode_is_not_lossy():
    assert can_encode(is_lossy=False) is True
    assert can_encode(is_lossy=True) is False


def test_passthrough_media_types():
    assert passthrough_media("mp3") == ("audio/mpeg", "mp3")
    assert passthrough_media("aac") == ("audio/mp4", "m4a")


@pytest.mark.parametrize("codec", [None, "", "flac", "src"])
def test_passthrough_media_unknown_raises(codec):
    with pytest.raises(ValueError, match="mp3 or aac"):
        passthrough_media(codec)
