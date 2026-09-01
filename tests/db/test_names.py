"""Stable name normalization and entity IDs."""

from musicweb.db.names import (
    UNKNOWN_ARTIST,
    album_id_for,
    artist_id_for,
    display_name,
    normalize_name,
    sort_name,
    track_id_for,
)


def test_normalize_name_collapses_and_casefolds():
    assert normalize_name("  Radio  Head ") == "radio head"
    assert normalize_name(None) == ""
    assert normalize_name("") == ""
    assert normalize_name("Various Artists") == "various artists"


def test_display_name_fallback():
    assert display_name(None, UNKNOWN_ARTIST) == UNKNOWN_ARTIST
    assert display_name("  ", UNKNOWN_ARTIST) == UNKNOWN_ARTIST
    assert display_name("  OK Computer  ", UNKNOWN_ARTIST) == "OK Computer"


def test_sort_name_strips_article():
    assert sort_name("The Beatles") == "beatles"


def test_ids_are_stable_and_keyed():
    a = artist_id_for("radiohead")
    assert artist_id_for("radiohead") == a
    assert album_id_for(a, "ok computer") != album_id_for("other", "ok computer")
    assert track_id_for("flac-md5", "abc") != track_id_for("sha256", "abc")
    assert track_id_for("flac-md5", "abc") == track_id_for("flac-md5", "abc")
