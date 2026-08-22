"""musicweb radio CLI: help, live-socket gate, spoiler filtering."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from typer.testing import CliRunner

from musicweb.cli.radio import app

runner = CliRunner()

_STATUS = {
    "face": "current",
    "track_id": "cur",
    "title": "Now",
    "artist": "Art",
    "album": "Alb",
    "started_at": "2026-01-01T00:00:00+00:00",
    "position": 1.5,
    "duration": 180.0,
    "tuner_count": 1,
    "tuner_profiles": ["opus-96"],
    "catalog_watermark": None,
    "eligible_count": 10,
    "upcoming_count": 1,
    "banlist_batch_sizes": [8],
    "skip_ids_count": 0,
    "upcoming": [{"id": "secret1", "title": "Hidden", "artist": "Nope"}],
    "banlist": [[{"id": "secret1", "title": "Hidden", "artist": "Nope"}]],
}


def _patch_client(monkeypatch, *, healthy: bool = True):
    calls: dict = {}

    class Fake:
        def __init__(self, data_dir, **kwargs) -> None:
            calls["data_dir"] = data_dir

        def health(self) -> bool:
            return healthy

        def radio_status(self, *, spoilers: bool = False) -> dict:
            calls["status_spoilers"] = spoilers
            return dict(_STATUS)

        def radio_play(self, track_id: str, *, spoilers: bool = False) -> dict:
            calls["play"] = track_id
            calls["play_spoilers"] = spoilers
            body = dict(_STATUS)
            body["track_id"] = track_id
            return body

        def radio_skip_ids(self) -> dict:
            return {
                "skip_ids_count": 1,
                "skip_ids": [{"id": "bad", "title": "B", "artist": "X"}],
            }

        def radio_skip(self, *, spoilers: bool = False) -> dict:
            calls["skip_spoilers"] = spoilers
            return dict(_STATUS)

        def radio_pick(self, *, spoilers: bool = False) -> dict:
            return dict(_STATUS)

        def radio_reset(self, *, spoilers: bool = False) -> dict:
            return dict(_STATUS)

        def radio_banlist(self, *, spoilers: bool = False) -> dict:
            calls["banlist_spoilers"] = spoilers
            return {
                "banlist_batch_sizes": [8],
                "banlist": [[{"id": "secret1", "title": "Hidden", "artist": "Nope"}]],
            }

        def radio_skip_ids_clear(self) -> dict:
            return {"skip_ids_count": 0, "skip_ids": []}

    monkeypatch.setattr("musicweb.cli.radio.ControlClient", Fake)
    monkeypatch.setattr(
        "musicweb.cli.radio.load_settings",
        lambda: SimpleNamespace(musicweb_data_dir=Path("/tmp/data")),
    )
    return calls


def test_bare_radio_prints_help():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "status" in result.stdout
    assert "skip" in result.stdout
    assert "play" in result.stdout
    assert "pick" in result.stdout
    assert "reset" in result.stdout
    assert "banlist" in result.stdout
    assert "skip-ids" in result.stdout
    assert "debug" in result.stdout.lower() or "live server" in result.stdout.lower()


def test_no_socket_exits_1(monkeypatch):
    _patch_client(monkeypatch, healthy=False)
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 1
    assert "live server" in result.stderr.lower() or "control socket" in result.stderr.lower()
    assert "secret1" not in result.stdout


def test_status_hides_upcoming_even_if_payload_includes_them(monkeypatch):
    calls = _patch_client(monkeypatch)
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 0
    assert calls["status_spoilers"] is False
    assert "face: current" in result.stdout
    assert "track: cur  Now — Art" in result.stdout
    assert "album: Alb" in result.stdout
    assert "tuners: 1 (opus-96)" in result.stdout
    assert "upcoming: 1" in result.stdout
    assert "secret1" not in result.stdout
    assert "Hidden" not in result.stdout


def test_status_spoilers_prints_upcoming(monkeypatch):
    calls = _patch_client(monkeypatch)
    result = runner.invoke(app, ["status", "--spoilers"])
    assert result.exit_code == 0
    assert calls["status_spoilers"] is True
    assert "secret1" in result.stdout
    assert "Hidden" in result.stdout


def test_play_forwards_track_id(monkeypatch):
    calls = _patch_client(monkeypatch)
    result = runner.invoke(app, ["play", "abc123"])
    assert result.exit_code == 0
    assert calls["play"] == "abc123"
    assert calls["play_spoilers"] is False


def test_skip_ids_has_no_spoilers_flag(monkeypatch):
    _patch_client(monkeypatch)
    listed = runner.invoke(app, ["skip-ids"])
    assert listed.exit_code == 0
    assert "bad  B — X" in listed.stdout
    flagged = runner.invoke(app, ["skip-ids", "--spoilers"])
    assert flagged.exit_code != 0
