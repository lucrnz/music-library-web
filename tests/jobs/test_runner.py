"""LibraryJobRunner single-flight and cancel with mocked _execute."""

from __future__ import annotations

import threading

import pytest

from musicweb.artist_image import ArtistImageStore
from musicweb.cover import CoverStore
from musicweb.db.models import ScanState
from musicweb.jobs.runner import LibraryJobRunner
from musicweb.library import Library


def _runner(tmp_home, db) -> LibraryJobRunner:
    return LibraryJobRunner(
        db,
        Library(tmp_home.lib),
        CoverStore(tmp_home.data),
        ArtistImageStore(tmp_home.data),
        tmp_home.settings,
    )


def test_status_idle_after_init(tmp_home, db):
    runner = _runner(tmp_home, db)
    assert runner.status()["status"] == "idle"


def test_start_single_flight_and_run_sync_busy(tmp_home, db, monkeypatch):
    runner = _runner(tmp_home, db)
    gate = threading.Event()
    entered = threading.Event()

    def blocked(self, kind, *, mode="quick", force=False):
        entered.set()
        gate.wait(timeout=5)

    monkeypatch.setattr(LibraryJobRunner, "_execute", blocked)
    try:
        assert runner.start("scan") is True
        assert entered.wait(timeout=2)
        assert runner.status()["status"] == "running"
        assert runner.start("scan") is False
        with pytest.raises(RuntimeError, match="already running"):
            runner.run_sync("scan")
    finally:
        gate.set()
        runner.shutdown()
    assert runner.is_running is False
    assert not any(t.name == "library-job" for t in threading.enumerate())


def test_request_cancel_idle(tmp_home, db):
    runner = _runner(tmp_home, db)
    assert runner.request_cancel() is False
    assert runner.status()["status"] == "idle"


def test_request_cancel_running(tmp_home, db, monkeypatch):
    runner = _runner(tmp_home, db)
    gate = threading.Event()
    entered = threading.Event()

    def blocked(self, kind, *, mode="quick", force=False):
        entered.set()
        gate.wait(timeout=5)

    monkeypatch.setattr(LibraryJobRunner, "_execute", blocked)
    try:
        assert runner.start("scan") is True
        assert entered.wait(timeout=2)
        assert runner.request_cancel() is True
        assert runner.status()["status"] == "canceling"
    finally:
        gate.set()
        runner.shutdown()
    assert runner.is_running is False


def test_run_sync_clears_running_on_success_and_error(tmp_home, db, monkeypatch):
    runner = _runner(tmp_home, db)
    seen: list[tuple] = []

    def record(self, kind, *, mode="quick", force=False):
        seen.append((kind, mode, force))

    monkeypatch.setattr(LibraryJobRunner, "_execute", record)
    runner.run_sync("regen-covers", force=True)
    assert seen == [("regen-covers", "quick", True)]
    assert runner.is_running is False

    def boom(self, kind, *, mode="quick", force=False):
        raise RuntimeError("encode exploded")

    monkeypatch.setattr(LibraryJobRunner, "_execute", boom)
    with pytest.raises(RuntimeError, match="encode exploded"):
        runner.run_sync("scan")
    assert runner.is_running is False


def test_start_writes_running_before_execute(tmp_home, db, monkeypatch):
    runner = _runner(tmp_home, db)
    entered = threading.Event()
    gate = threading.Event()
    saw_running = {"ok": False}

    def blocked(self, kind, *, mode="quick", force=False):
        with db.session() as session:
            row = session.get(ScanState, 1)
            saw_running["ok"] = row is not None and row.status == "running"
        entered.set()
        gate.wait(timeout=5)

    monkeypatch.setattr(LibraryJobRunner, "_execute", blocked)
    try:
        assert runner.start("scan") is True
        assert entered.wait(timeout=2)
        assert saw_running["ok"] is True
    finally:
        gate.set()
        runner.shutdown()


def test_scan_finish_sets_watermark_regen_does_not_clear(tmp_home, db):
    runner = _runner(tmp_home, db)
    runner.run_sync("scan")
    with db.session() as session:
        row = session.get(ScanState, 1)
        assert row is not None
        scan_stamp = row.last_scan_finished_at
        assert scan_stamp
        assert row.finished_at == scan_stamp
        assert row.kind == "scan"

    runner.run_sync("regen-lyrics", force=True)
    with db.session() as session:
        row = session.get(ScanState, 1)
        assert row is not None
        assert row.kind == "regen-lyrics"
        assert row.last_scan_finished_at == scan_stamp
