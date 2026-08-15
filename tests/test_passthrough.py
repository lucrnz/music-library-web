"""Reserved source passthrough vs encode fork."""

import pytest

from musicweb.transcode.passthrough import (
    SOURCE_TAG,
    StreamConflict,
    passthrough_media,
    plan_stream,
)
from musicweb.transcode.profiles import DEFAULT_PROFILE_TAG


def test_lossless_opus_encodes():
    assert plan_stream(is_lossy=False, codec=DEFAULT_PROFILE_TAG) == "encode"


def test_lossless_source_conflicts():
    with pytest.raises(StreamConflict):
        plan_stream(is_lossy=False, codec=SOURCE_TAG)


def test_lossy_source_passthrough():
    assert plan_stream(is_lossy=True, codec=SOURCE_TAG) == "passthrough"


def test_lossy_opus_conflicts():
    with pytest.raises(StreamConflict):
        plan_stream(is_lossy=True, codec=DEFAULT_PROFILE_TAG)


def test_unknown_tag_is_value_error():
    with pytest.raises(ValueError):
        plan_stream(is_lossy=False, codec="src")
    with pytest.raises(ValueError):
        plan_stream(is_lossy=True, codec="src")


def test_passthrough_media_types():
    assert passthrough_media("mp3") == ("audio/mpeg", "mp3")
    assert passthrough_media("aac") == ("audio/mp4", "m4a")
