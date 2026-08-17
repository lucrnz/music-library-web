"""Library.browse / collect_audio listing and natural sort."""

from musicweb.library import Library


def _touch(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")


def test_browse_filters_and_natural_sorts(tmp_home):
    root = tmp_home.lib
    _touch(root / "01.flac")
    _touch(root / "2.flac")
    _touch(root / "10.flac")
    _touch(root / "notes.txt")
    _touch(root / ".hidden.flac")
    (root / "Sub").mkdir()
    _touch(root / "skip.mp3")

    lib = Library(root, index_lossy=False)
    body = lib.browse("")
    assert body["path"] == ""
    assert [d["name"] for d in body["dirs"]] == ["Sub"]
    assert [f["name"] for f in body["files"]] == ["01.flac", "2.flac", "10.flac"]


def test_collect_audio_recursive_skips_lossy_and_dotfiles(tmp_home):
    root = tmp_home.lib
    _touch(root / "2.flac")
    _touch(root / "10.flac")
    _touch(root / "Sub" / "nested.flac")
    _touch(root / "skip.mp3")
    _touch(root / ".hidden.flac")

    lib = Library(root, index_lossy=False)
    paths = lib.collect_audio()
    assert paths == ["2.flac", "10.flac", "Sub/nested.flac"]
