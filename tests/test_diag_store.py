"""Daily JSONL writer + size-cap rotation."""

from datetime import datetime, timezone
from pathlib import Path

import pytest

from musicweb.config import Settings
from musicweb.diag.store import (
    append,
    append_many,
    event_files,
    events_filename,
    maybe_rotate,
)


def test_append_rejects_non_dict(tmp_path: Path):
    with pytest.raises(TypeError):
        append(tmp_path, ["not", "a", "dict"])  # type: ignore[arg-type]


def test_two_writes_same_day_one_file(tmp_path: Path):
    day = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)
    first = append(tmp_path, {"n": 1}, day=day)
    second = append(tmp_path, {"n": 2}, day=day)
    assert first == second
    assert first.name == "events-2026-08-15.jsonl"
    lines = first.read_text(encoding="utf-8").splitlines()
    assert lines == ['{"n": 1}', '{"n": 2}']


def test_next_day_opens_new_file(tmp_path: Path):
    d1 = datetime(2026, 8, 15, 23, 0, tzinfo=timezone.utc)
    d2 = datetime(2026, 8, 16, 1, 0, tzinfo=timezone.utc)
    a = append(tmp_path, {"n": 1}, day=d1)
    b = append(tmp_path, {"n": 2}, day=d2)
    assert a.name == "events-2026-08-15.jsonl"
    assert b.name == "events-2026-08-16.jsonl"
    assert a.read_text(encoding="utf-8") == '{"n": 1}\n'
    assert b.read_text(encoding="utf-8") == '{"n": 2}\n'


def test_rotate_drops_oldest_keeps_today(tmp_path: Path):
    older = tmp_path / "events-2026-08-13.jsonl"
    mid = tmp_path / "events-2026-08-14.jsonl"
    today = tmp_path / "events-2026-08-15.jsonl"
    older.write_bytes(b"x" * 40)
    mid.write_bytes(b"y" * 40)
    today.write_bytes(b"z" * 40)
    maybe_rotate(tmp_path, max_bytes=50)
    assert not older.exists()
    assert not mid.exists()
    assert today.exists()
    assert today.read_bytes() == b"z" * 40


def test_rotate_does_not_delete_only_file(tmp_path: Path):
    today = tmp_path / "events-2026-08-15.jsonl"
    today.write_bytes(b"z" * 200)
    maybe_rotate(tmp_path, max_bytes=50)
    assert today.exists()


def test_rotate_ignores_non_event_files(tmp_path: Path):
    junk = tmp_path / "notes.txt"
    junk.write_bytes(b"j" * 200)
    today = tmp_path / "events-2026-08-15.jsonl"
    today.write_bytes(b"z" * 10)
    maybe_rotate(tmp_path, max_bytes=5)
    assert junk.exists()
    assert today.exists()


def test_events_filename_utc():
    naive = datetime(2026, 8, 15, 23, 0, 0)
    assert events_filename(naive) == "events-2026-08-15.jsonl"


def test_event_files_lists_matching_sorted(tmp_path: Path):
    (tmp_path / "notes.txt").write_text("x", encoding="utf-8")
    later = tmp_path / "events-2026-08-16.jsonl"
    earlier = tmp_path / "events-2026-08-15.jsonl"
    later.write_text("{}\n", encoding="utf-8")
    earlier.write_text("{}\n", encoding="utf-8")
    assert event_files(tmp_path) == [earlier, later]


def test_append_many_rotates_once(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    called = []
    monkeypatch.setattr(
        "musicweb.diag.store.maybe_rotate",
        lambda *args, **kwargs: called.append(True),
    )
    path = append_many(tmp_path, [{"n": 1}, {"n": 2}, {"n": 3}])
    assert path is not None
    assert path.read_text(encoding="utf-8").splitlines() == [
        '{"n": 1}',
        '{"n": 2}',
        '{"n": 3}',
    ]
    assert called == [True]


def test_append_many_empty_is_noop(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    called = []
    monkeypatch.setattr(
        "musicweb.diag.store.maybe_rotate",
        lambda *args, **kwargs: called.append(True),
    )
    assert append_many(tmp_path, []) is None
    assert called == []
    assert list(tmp_path.iterdir()) == []


def test_ensure_data_dir_creates_diag(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "data"
    settings = Settings(
        music_library_path=tmp_path,
        musicweb_data_dir=data,
    )
    settings.ensure_data_dir()
    assert settings.diag_dir.is_dir()
    assert settings.diag_dir == data / "diag"
