"""musicweb logs list / show / purge."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from typer.testing import CliRunner

from musicweb.cli.logs import app
from musicweb.config import Settings

runner = CliRunner()


@pytest.fixture
def diag_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    data = tmp_path / "data"
    data.mkdir()
    diag = data / "diag"
    diag.mkdir()
    settings = Settings(music_library_path=tmp_path, musicweb_data_dir=data)

    def _load() -> Settings:
        return settings

    monkeypatch.setattr("musicweb.cli.logs.load_settings", _load)
    return diag


def _write(path: Path, *lines: str) -> None:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_list_and_show_filters(diag_home: Path):
    _write(
        diag_home / "events-2026-08-14.jsonl",
        '{"event":"player.load.fail","client_id":"A","level":"error","source":"client"}',
        '{"event":"diag.boot","client_id":"A","level":"info","source":"client"}',
        "not-json",
        '{"event":"player.load.fail","client_id":"B","level":"error","source":"client"}',
    )
    _write(
        diag_home / "events-2026-08-15.jsonl",
        '{"event":"http.stream","client_id":"A","level":"info","source":"server"}',
    )
    listed = runner.invoke(app, ["list"])
    assert listed.exit_code == 0
    assert "2026-08-14" in listed.stdout
    assert "2026-08-15" in listed.stdout

    shown = runner.invoke(
        app, ["show", "--client", "A", "--event", "player.load.fail"]
    )
    assert shown.exit_code == 0
    assert "player.load.fail" in shown.stdout
    assert '"client_id": "A"' in shown.stdout or '"client_id":"A"' in shown.stdout
    assert "client_id\":\"B\"" not in shown.stdout.replace(" ", "")
    assert "diag.boot" not in shown.stdout
    assert "skipped 1 corrupt line" in shown.stderr

    errors = runner.invoke(app, ["show", "--level", "error"])
    assert errors.exit_code == 0
    assert "player.load.fail" in errors.stdout
    assert "diag.boot" not in errors.stdout
    assert "http.stream" not in errors.stdout


def test_purge_older_than_zero_keeps_today(diag_home: Path):
    today = datetime.now(timezone.utc).date().isoformat()
    _write(diag_home / "events-2026-08-01.jsonl", '{"event":"old"}')
    _write(diag_home / f"events-{today}.jsonl", '{"event":"today"}')
    result = runner.invoke(app, ["purge", "--older-than", "0", "--yes"])
    assert result.exit_code == 0
    assert not (diag_home / "events-2026-08-01.jsonl").exists()
    assert (diag_home / f"events-{today}.jsonl").exists()


def test_purge_all(diag_home: Path):
    _write(diag_home / "events-2026-08-01.jsonl", '{"event":"a"}')
    _write(diag_home / "events-2026-08-02.jsonl", '{"event":"b"}')
    (diag_home / "notes.txt").write_text("keep", encoding="utf-8")
    result = runner.invoke(app, ["purge", "--all", "--yes"])
    assert result.exit_code == 0
    assert list(diag_home.glob("events-*.jsonl")) == []
    assert (diag_home / "notes.txt").exists()
