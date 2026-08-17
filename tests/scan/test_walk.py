"""Indexable audio walk: suffixes, dotfiles, cancel."""

from musicweb.scan.walk import iter_indexable_audio


def _touch(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")


def test_walk_skips_dotfiles_and_lossy_by_default(tmp_path):
    _touch(tmp_path / "ok.flac")
    _touch(tmp_path / "skip.mp3")
    _touch(tmp_path / ".dot.flac")
    _touch(tmp_path / "dir" / "nested.flac")
    _touch(tmp_path / "readme.txt")

    found = {p.name for p in iter_indexable_audio(tmp_path, index_lossy=False)}
    assert found == {"ok.flac", "nested.flac"}


def test_walk_index_lossy_includes_mp3(tmp_path):
    _touch(tmp_path / "ok.flac")
    _touch(tmp_path / "skip.mp3")
    _touch(tmp_path / "dir" / "nested.flac")

    found = {p.name for p in iter_indexable_audio(tmp_path, index_lossy=True)}
    assert found == {"ok.flac", "nested.flac", "skip.mp3"}


def test_walk_cancel_stops(tmp_path):
    _touch(tmp_path / "a.flac")
    _touch(tmp_path / "b.flac")
    _touch(tmp_path / "c.flac")
    seen = 0

    def cancel():
        return seen >= 1

    names = []
    for path in iter_indexable_audio(tmp_path, cancel=cancel):
        names.append(path.name)
        seen += 1
    assert len(names) == 1
