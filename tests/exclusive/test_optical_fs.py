"""Yellow Book volume jail and allowlisted walk."""

from __future__ import annotations

from pathlib import Path

from musicweb.exclusive.optical_fs import jail_join, walk_volume


def _touch(path: Path, name: str) -> Path:
    dest = path / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(b"x")
    return dest


def test_allowlist_mp3_in_ogg_wav_opus_mp4_out(tmp_path: Path):
    _touch(tmp_path, "ok.mp3")
    _touch(tmp_path, "ok.aac")
    _touch(tmp_path, "ok.alac")
    _touch(tmp_path, "skip.ogg")
    _touch(tmp_path, "skip.wav")
    _touch(tmp_path, "skip.opus")
    _touch(tmp_path, "skip.mp4")
    _touch(tmp_path, ".DS_Store")
    _touch(tmp_path, "._ok.mp3")
    index = walk_volume(tmp_path)
    rels = {item.rel for item in index.files}
    assert rels == {"ok.mp3", "ok.aac", "ok.alac"}
    codecs = {item.rel: item.source_codec for item in index.files}
    assert codecs["ok.mp3"] == "mp3"
    assert codecs["ok.aac"] == "aac"
    assert codecs["ok.alac"] == "alac"


def test_m4a_uses_mp4_kind(tmp_path: Path, monkeypatch):
    import musicweb.exclusive.optical_fs as optical_fs

    _touch(tmp_path, "song.m4a")
    _touch(tmp_path, "other.m4a")

    def fake_codec(path: Path) -> str | None:
        return "aac" if path.name == "song.m4a" else None

    monkeypatch.setattr(optical_fs, "_m4a_source_codec", fake_codec)
    index = walk_volume(tmp_path)
    assert [item.rel for item in index.files] == ["song.m4a"]
    assert index.files[0].source_codec == "aac"


def test_jail_rejects_escape_absolute_nul_drive(tmp_path: Path):
    root = tmp_path / "vol"
    root.mkdir()
    _touch(root, "ok.mp3")
    assert jail_join(root, "ok.mp3") == (root / "ok.mp3").resolve()
    assert jail_join(root, "") == root.resolve()
    assert jail_join(root, ".") == root.resolve()
    assert jail_join(root, "..") is None
    assert jail_join(root, "../etc/passwd") is None
    assert jail_join(root, "/etc/passwd") is None
    assert jail_join(root, "foo\x00bar") is None
    assert jail_join(root, "C:windows") is None
    assert jail_join(root, "foo/../ok.mp3") is None
    assert jail_join(root, "foo//bar") is None


def test_auto_add_root_only(tmp_path: Path):
    _touch(tmp_path, "a.mp3")
    _touch(tmp_path, "b.flac")
    index = walk_volume(tmp_path)
    assert index.auto_add_rel == ""
    assert {item.source_codec for item in index.files} == {"mp3", "flac"}


def test_auto_add_single_folder(tmp_path: Path):
    _touch(tmp_path, "Music/a.mp3")
    _touch(tmp_path, "Music/b.wma")
    index = walk_volume(tmp_path)
    assert index.auto_add_rel == "Music"
    assert [d.rel for d in index.dirs] == ["Music"]
    codecs = {item.rel: item.source_codec for item in index.files}
    assert codecs == {"Music/a.mp3": "mp3", "Music/b.wma": "wma"}


def test_auto_add_two_folders_is_null(tmp_path: Path):
    _touch(tmp_path, "Music/a.mp3")
    _touch(tmp_path, "Extra/b.flac")
    index = walk_volume(tmp_path)
    assert index.auto_add_rel is None
    assert {d.rel for d in index.dirs} == {"Music", "Extra"}


def test_list_children_sorts_numbered_before_filename(tmp_path: Path):
    from musicweb.exclusive.optical_fs import CdromFile, CdromIndex

    index = CdromIndex(
        files=[
            CdromFile(name="z.mp3", rel="z.mp3", source_codec="mp3"),
            CdromFile(name="b.mp3", rel="b.mp3", source_codec="mp3", track=2, disc=1),
            CdromFile(name="a.mp3", rel="a.mp3", source_codec="mp3", track=1, disc=1),
        ]
    )
    _dirs, files = index.list_children("")
    assert [item.rel for item in files] == ["a.mp3", "b.mp3", "z.mp3"]


def test_nested_folders_are_two_parents(tmp_path: Path):
    _touch(tmp_path, "Music/a.mp3")
    _touch(tmp_path, "Music/Singles/b.mp3")
    index = walk_volume(tmp_path)
    assert index.auto_add_rel is None
    dirs, files = index.list_children("Music")
    assert [d.rel for d in dirs] == ["Music/Singles"]
    assert [f.rel for f in files] == ["Music/a.mp3"]
