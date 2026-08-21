"""Library.resolve path jail."""

import pytest

from musicweb.library import Library, PathEscapeError


def test_empty_and_dot_resolve_to_root(tmp_home):
    lib = Library(tmp_home.lib)
    assert lib.resolve("") == tmp_home.lib.resolve()
    assert lib.resolve(".") == tmp_home.lib.resolve()
    assert lib.resolve(None) == tmp_home.lib.resolve()


def test_relative_stays_under_root(tmp_home):
    nested = tmp_home.lib / "Album"
    nested.mkdir()
    lib = Library(tmp_home.lib)
    assert lib.resolve("Album") == nested.resolve()


@pytest.mark.parametrize(
    "rel",
    ["..", "../outside", "/etc/passwd", "~", "~/music", "..\\escape"],
)
def test_escape_raises(tmp_home, rel):
    lib = Library(tmp_home.lib)
    with pytest.raises(PathEscapeError):
        lib.resolve(rel)


def test_present_audio_empty_or_missing_is_none(tmp_home):
    lib = Library(tmp_home.lib)
    assert lib.present_audio(None) is None
    assert lib.present_audio("") is None
    assert lib.present_audio("missing.flac") is None


def test_present_audio_escape_is_none(tmp_home):
    lib = Library(tmp_home.lib)
    assert lib.present_audio("..") is None
    assert lib.present_audio("/etc/passwd") is None


def test_present_audio_indexable_flac(tmp_home):
    flac = tmp_home.lib / "song.flac"
    flac.write_bytes(b"fLaC")
    lib = Library(tmp_home.lib)
    assert lib.present_audio("song.flac") == flac.resolve()


def test_present_audio_directory_is_none(tmp_home):
    (tmp_home.lib / "Album").mkdir()
    lib = Library(tmp_home.lib)
    assert lib.present_audio("Album") is None


def test_present_audio_lossy_respects_index_lossy(tmp_home):
    mp3 = tmp_home.lib / "song.mp3"
    mp3.write_bytes(b"xx")
    off = Library(tmp_home.lib, index_lossy=False)
    on = Library(tmp_home.lib, index_lossy=True)
    assert off.present_audio("song.mp3") is None
    assert on.present_audio("song.mp3") == mp3.resolve()
