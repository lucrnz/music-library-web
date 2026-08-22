"""Transcoder.forget_paths and resolve_forget (id → path, retain skip)."""

from __future__ import annotations

import threading
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from musicweb.transcode.forget import resolve_forget
from musicweb.transcode.profiles import PROFILES, get_profile
from musicweb.transcode.worker import Transcoder, _Job


def _job(rel: str, *, key: str | None = None) -> _Job:
    profile = get_profile("opus_192_48000")
    return _Job(
        key=key or f"key-{rel}",
        source=Path(rel),
        relative_path=rel,
        profile=profile,
        urgent=False,
    )


def _write_all_profiles(tc: Transcoder, rel: str) -> list[Path]:
    written: list[Path] = []
    for profile in PROFILES.values():
        out = tc._out_path(tc._cache_key(rel, profile.tag), profile)
        out.write_bytes(b"x")
        partial = tc.temp_dir / f"{out.name}.partial"
        partial.write_bytes(b"p")
        written.extend((out, partial))
    return written


def test_forget_paths_deletes_all_profiles_leaves_other_path(tmp_path: Path) -> None:
    tc = Transcoder()
    tc.start(tmp_path)
    try:
        gone = _write_all_profiles(tc, "a.flac")
        keep = _write_all_profiles(tc, "b.flac")
        removed = tc.forget_paths(["a.flac"])
        assert removed == len(gone)
        assert all(not p.exists() for p in gone)
        assert all(p.exists() for p in keep)
        assert any(tmp_path.iterdir())
    finally:
        tc.shutdown()


def test_forget_paths_cancels_queued_job_leaves_other(tmp_path: Path) -> None:
    tc = Transcoder()
    tc._temp_dir = tmp_path
    drop = _job("a.flac", key="drop")
    stay = _job("b.flac", key="stay")
    with tc._queue_cond:
        tc._jobs[drop.key] = drop
        tc._jobs[stay.key] = stay
        tc._playlist.append(drop)
        tc._urgent.append(stay)
        extra = _job("a.flac", key="drop-dl")
        extra.prewarm_class = "download"
        tc._jobs[extra.key] = extra
        tc._download.append(extra)
    assert tc.forget_paths(["a.flac"]) == 0
    assert drop.done.is_set()
    assert drop.error is not None
    assert drop.key not in tc._jobs
    assert extra.done.is_set()
    assert extra.key not in tc._jobs
    assert list(tc._playlist) == []
    assert list(tc._download) == []
    assert list(tc._urgent) == [stay]
    assert stay.key in tc._jobs
    assert not stay.done.is_set()


def test_forget_paths_purges_running_job(tmp_path: Path) -> None:
    tc = Transcoder()
    tc._temp_dir = tmp_path
    running = _job("a.flac", key="run")
    with tc._queue_cond:
        tc._jobs[running.key] = running
        tc._current = running

    def release() -> None:
        while True:
            with tc._queue_cond:
                if running.cancel_requested:
                    tc._current = None
                    tc._jobs.pop(running.key, None)
                    running.error = RuntimeError("Cache cleared")
                    running.done.set()
                    tc._queue_cond.notify_all()
                    return
                tc._queue_cond.wait(timeout=0.05)

    thread = threading.Thread(target=release, daemon=True)
    thread.start()
    assert tc.forget_paths(["a.flac"]) == 0
    thread.join(timeout=2)
    assert running.purged
    assert running.cancel_requested
    assert tc._current is None
    assert running.key not in tc._jobs


def _track(**kwargs) -> SimpleNamespace:
    values = dict(
        id="ok",
        is_missing=False,
        rel_path="ok.flac",
        is_lossy=False,
    )
    values.update(kwargs)
    return SimpleNamespace(**values)


def test_resolve_forget_empty_and_unique(monkeypatch) -> None:
    monkeypatch.setattr(
        "musicweb.transcode.forget.tracks_repo.get_many",
        lambda _session, _ids: [],
    )
    assert resolve_forget(Mock(), [], frozenset()) == ([], 0, 0)
    assert resolve_forget(Mock(), ["", ""], frozenset()) == ([], 0, 0)
    monkeypatch.setattr(
        "musicweb.transcode.forget.tracks_repo.get_many",
        lambda _session, ids: [_track(id=i, rel_path=f"{i}.flac") for i in ids],
    )
    paths, forgotten, skipped = resolve_forget(
        Mock(), ["a", "a", "b"], frozenset()
    )
    assert paths == ["a.flac", "b.flac"]
    assert forgotten == 2
    assert skipped == 0


def test_resolve_forget_skips_retained_unknown_lossy(monkeypatch) -> None:
    rows = {
        "keep": _track(id="keep", rel_path="keep.flac"),
        "drop": _track(id="drop", rel_path="drop.flac"),
        "mp3": _track(id="mp3", rel_path="x.mp3", is_lossy=True),
        "gone": _track(id="gone", rel_path=None, is_missing=True),
    }
    monkeypatch.setattr(
        "musicweb.transcode.forget.tracks_repo.get_many",
        lambda _session, ids: [rows[i] for i in ids if i in rows],
    )
    paths, forgotten, skipped = resolve_forget(
        Mock(),
        ["keep", "drop", "mp3", "gone", "unknown"],
        frozenset({"keep"}),
    )
    assert paths == ["drop.flac"]
    assert forgotten == 1
    assert skipped == 4


def test_resolve_then_forget_leaves_retained_files(
    tmp_path: Path, monkeypatch
) -> None:
    tc = Transcoder()
    tc.start(tmp_path)
    try:
        drop_files = _write_all_profiles(tc, "drop.flac")
        keep_files = _write_all_profiles(tc, "keep.flac")
        monkeypatch.setattr(
            "musicweb.transcode.forget.tracks_repo.get_many",
            lambda _session, ids: [
                _track(id=i, rel_path=f"{i}.flac") for i in ids
            ],
        )
        paths, forgotten, skipped = resolve_forget(
            Mock(), ["drop", "keep"], frozenset({"keep"})
        )
        assert forgotten == 1
        assert skipped == 1
        assert tc.forget_paths(paths) == len(drop_files)
        assert all(not p.exists() for p in drop_files)
        assert all(p.exists() for p in keep_files)
    finally:
        tc.shutdown()
