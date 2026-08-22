"""run_index: walk+batch dispatch, cancel-stop."""

from pathlib import Path
from unittest.mock import patch

from musicweb.library import Library
from musicweb.scan.index_phase import run_index


def _touch(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")


def test_run_index_sees_flac(db, tmp_home):
    _touch(tmp_home.lib / "a.flac")
    _touch(tmp_home.lib / "nested" / "b.flac")
    _touch(tmp_home.lib / "skip.mp3")
    lib = Library(tmp_home.lib)
    progress = []

    def fake_batch(_db, _lib, batch_paths, _mode, cancel=None):
        return len(batch_paths), len(batch_paths), {}, set()

    with patch("musicweb.scan.index_phase.process_batch", side_effect=fake_batch):
        result = run_index(
            db,
            lib,
            "quick",
            cancel=lambda: False,
            on_progress=lambda **kw: progress.append(kw),
        )
    assert result.seen_count == 2
    assert result.upserted == 2
    assert result.seen_paths == {"a.flac", "nested/b.flac"}
    assert progress
    assert progress[-1]["files_seen"] == 2


def test_run_index_cancel_stops_before_flush(db, tmp_home):
    _touch(tmp_home.lib / "a.flac")
    _touch(tmp_home.lib / "b.flac")
    lib = Library(tmp_home.lib)
    called = []

    def fake_batch(*_args, **_kwargs):
        called.append(1)
        return 0, 0, {}, set()

    with patch("musicweb.scan.index_phase.process_batch", side_effect=fake_batch):
        result = run_index(
            db, lib, "quick", cancel=lambda: True, batch_size=10
        )
    assert called == []
    assert result.seen_count == 0
    assert result.seen_paths == set()
