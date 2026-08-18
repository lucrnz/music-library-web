"""process_batch: quick skip, lossy sibling, cancel."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from musicweb.db.models import Track
from musicweb.db.names import track_id_for
from musicweb.library import Library
from musicweb.scan.batch import process_batch
from musicweb.scan.identity import resolve_track


def _fp(path: Path):
    digest = path.name
    return SimpleNamespace(
        algo="sha256",
        fingerprint=digest,
        track_id=track_id_for("sha256", digest),
    )


def _meta(path: Path):
    return SimpleNamespace(
        title=path.stem,
        artist="A",
        album="B",
        albumartist="A",
        track=1,
        disc=None,
        year=None,
        duration=1.0,
        sample_rate_hz=44100,
        bit_depth=16,
        channels=2,
        source_codec="flac" if path.suffix == ".flac" else "mp3",
        bitrate_kbps=None,
        bitrate_mode=None,
    )


def test_quick_skip_does_not_fingerprint(db, tmp_home):
    path = tmp_home.lib / "same.flac"
    path.write_bytes(b"abc")
    stat = path.stat()
    rel = "same.flac"
    with db.session() as session:
        track = resolve_track(
            session,
            fingerprint="keep",
            fingerprint_algo="sha256",
            track_id=track_id_for("sha256", "keep"),
            rel_path=rel,
            existing_by_path=None,
            now="t0",
        )
        track.size_bytes = stat.st_size
        track.mtime_ns = int(stat.st_mtime_ns)
        session.commit()

    called = []

    def boom(p: Path):
        called.append(p)
        raise AssertionError("fingerprint should not run")

    lib = Library(tmp_home.lib)
    with patch("musicweb.scan.batch.compute_fingerprint", side_effect=boom):
        seen, upserted, _covers, skipped = process_batch(
            db, lib, [path], "quick"
        )
    assert called == []
    assert seen == 1
    assert upserted == 0
    assert skipped == set()


def test_lossy_sibling_not_seen(db, tmp_home):
    folder = tmp_home.lib
    flac = folder / "01 - Title.flac"
    mp3 = folder / "01 - Title.mp3"
    flac.write_bytes(b"x")
    mp3.write_bytes(b"x")
    lib = Library(folder)

    def lossless(p: Path) -> bool:
        return p.suffix == ".flac"

    def sibling_meta(_p: Path):
        return SimpleNamespace(disc=None, track=1)

    with (
        patch("musicweb.scan.siblings.is_lossless_audio", side_effect=lossless),
        patch("musicweb.scan.siblings.read_metadata", side_effect=sibling_meta),
        patch("musicweb.scan.batch.read_metadata", side_effect=_meta),
        patch("musicweb.scan.batch.compute_fingerprint", side_effect=_fp),
    ):
        seen, upserted, _covers, skipped = process_batch(
            db, lib, [flac, mp3], "full"
        )
    assert "01 - Title.mp3" in skipped
    assert seen == 1
    assert upserted == 1


def test_cancel_stops_mid_batch(db, tmp_home):
    a = tmp_home.lib / "a.flac"
    b = tmp_home.lib / "b.flac"
    a.write_bytes(b"x")
    b.write_bytes(b"x")
    lib = Library(tmp_home.lib)
    calls = {"n": 0}

    def cancel():
        calls["n"] += 1
        return calls["n"] > 1

    with (
        patch("musicweb.scan.batch.compute_fingerprint", side_effect=_fp),
        patch("musicweb.scan.batch.read_metadata", side_effect=_meta),
    ):
        process_batch(db, lib, [a, b], "full", cancel=cancel)
    assert calls["n"] == 2
    with db.session() as session:
        assert session.query(Track).count() == 1
