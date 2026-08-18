"""Smoke that the tmp-data-dir fixture migrates a real schema."""

from sqlalchemy import inspect

from musicweb.db.models import ScanState


def test_init_database_creates_tracks_fts_and_idle_scan_state(db, tmp_home):
    insp = inspect(db.engine)
    assert insp.has_table("tracks")
    assert "bitrate_mode" in {c["name"] for c in insp.get_columns("tracks")}
    assert insp.has_table("tracks_fts")
    assert (tmp_home.data / "library.db").is_file()

    with db.session() as session:
        row = session.get(ScanState, 1)
        assert row is not None
        assert row.status == "idle"
