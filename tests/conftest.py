"""Shared tmp library/data dir and migrated SQLite for pytest."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from musicweb.config import Settings
from musicweb.db.engine import Database, init_database


@pytest.fixture
def tmp_home(tmp_path, monkeypatch):
    lib = tmp_path / "library"
    data = tmp_path / "data"
    lib.mkdir()
    data.mkdir()
    monkeypatch.setenv("MUSIC_LIBRARY_PATH", str(lib))
    monkeypatch.setenv("MUSICWEB_DATA_DIR", str(data))
    settings = Settings(
        music_library_path=lib,
        musicweb_data_dir=data,
        _env_file=None,
    )
    return SimpleNamespace(root=tmp_path, lib=lib, data=data, settings=settings)


@pytest.fixture
def db(tmp_home) -> Database:
    database = init_database(tmp_home.data)
    try:
        yield database
    finally:
        database.dispose()
