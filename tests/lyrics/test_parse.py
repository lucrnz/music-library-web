"""LRC / remastered lyrics helpers."""

from musicweb.lyrics.parse import (
    looks_like_lrc,
    normalize_lyrics_text,
    plain_from_lrc,
    strip_remastered_noise,
)


def test_strip_remastered_brackets_and_dashes():
    assert strip_remastered_noise("Song (Remastered)") == "Song"
    assert strip_remastered_noise("Song [2011 Remaster]") == "Song"
    assert strip_remastered_noise("Song - Remastered") == "Song"
    assert strip_remastered_noise(None) == ""


def test_looks_like_lrc_and_plain_from_lrc():
    lrc = "[ar:X]\n[00:01.00]Hello\n[00:02.50]World"
    assert looks_like_lrc(lrc) is True
    assert looks_like_lrc("just words") is False
    assert looks_like_lrc("") is False
    assert plain_from_lrc(lrc) == "Hello\nWorld"


def test_normalize_lyrics_text():
    assert normalize_lyrics_text("  a\r\nb  ") == "a\nb"
    assert normalize_lyrics_text("   ") is None
    assert normalize_lyrics_text(None) is None
