"""Album lossy-kind roll-up (same reduce as finalize SQL)."""

from musicweb.scan.lossy_kind import album_lossy_kind


def test_empty_is_none():
    assert album_lossy_kind([]) is None


def test_all_mp3():
    assert album_lossy_kind(["mp3", "mp3"]) == "mp3"


def test_single_aac():
    assert album_lossy_kind(["aac"]) == "aac"


def test_mixed_mp3_aac():
    assert album_lossy_kind(["mp3", "aac"]) == "mixed"


def test_unknown_codec_is_lossy():
    assert album_lossy_kind(["opus"]) == "lossy"
    assert album_lossy_kind([None]) == "lossy"


def test_unknown_plus_mp3_is_mixed():
    assert album_lossy_kind(["mp3", None]) == "mixed"
