"""SQLite URL uses posix slashes for Windows absolute paths."""

from __future__ import annotations

from pathlib import PureWindowsPath

from musicweb.db.engine import init_database, sqlite_url


def test_sqlite_url_tmp_path_has_no_backslash(tmp_path):
    db = tmp_path / "library.db"
    url = sqlite_url(db)
    assert url == f"sqlite:///{db.as_posix()}"
    assert "\\" not in url


def test_sqlite_url_windows_absolute():
    url = sqlite_url(PureWindowsPath(r"C:\data\library.db"))
    assert url == "sqlite:///C:/data/library.db"


def test_init_database_still_opens(db, tmp_home):
    assert (tmp_home.data / "library.db").is_file()
    with db.session() as session:
        session.connection()
