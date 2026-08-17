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
