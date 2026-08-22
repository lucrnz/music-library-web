"""Transcoder prewarm classes: radio > download > playlist."""

from pathlib import Path

from musicweb.transcode.worker import Transcoder


def _tc(tmp_path: Path) -> Transcoder:
    tc = Transcoder()
    tc._temp_dir = tmp_path
    return tc


def test_distinct_keys_land_on_matching_deques(tmp_path: Path) -> None:
    tc = _tc(tmp_path)
    src = tmp_path / "x.flac"
    assert tc.prepare(src, "a.flac", tier="playlist") == "queued"
    assert tc.prepare(src, "b.flac", tier="download") == "queued"
    assert tc.prepare(src, "c.flac", tier="radio") == "queued"
    assert [j.relative_path for j in tc._playlist] == ["a.flac"]
    assert [j.relative_path for j in tc._download] == ["b.flac"]
    assert [j.relative_path for j in tc._radio] == ["c.flac"]


def test_same_key_playlist_then_download_promotes(tmp_path: Path) -> None:
    tc = _tc(tmp_path)
    src = tmp_path / "x.flac"
    assert tc.prepare(src, "a.flac", tier="playlist") == "queued"
    assert tc.prepare(src, "a.flac", tier="download") == "already"
    assert list(tc._playlist) == []
    assert len(tc._download) == 1
    assert tc._download[0].prewarm_class == "download"
    assert tc._download[0].relative_path == "a.flac"


def test_drop_pending_prewarm_leaves_radio_and_download(tmp_path: Path) -> None:
    tc = _tc(tmp_path)
    src = tmp_path / "x.flac"
    tc.prepare(src, "a.flac", tier="playlist")
    tc.prepare(src, "b.flac", tier="download")
    tc.prepare(src, "c.flac", tier="radio")
    assert tc.drop_pending_prewarm() == 1
    assert list(tc._playlist) == []
    assert [j.relative_path for j in tc._download] == ["b.flac"]
    assert [j.relative_path for j in tc._radio] == ["c.flac"]


def test_download_preempts_running_playlist(tmp_path: Path) -> None:
    tc = _tc(tmp_path)
    src = tmp_path / "x.flac"
    tc.prepare(src, "a.flac", tier="playlist")
    running = tc._playlist[0]
    with tc._queue_cond:
        tc._playlist.remove(running)
        tc._current = running
    tc.prepare(src, "b.flac", tier="download")
    assert running.cancel_requested


def test_requeue_canceled_keeps_download_class(tmp_path: Path) -> None:
    tc = _tc(tmp_path)
    src = tmp_path / "x.flac"
    tc.prepare(src, "a.flac", tier="download")
    job = tc._download[0]
    with tc._queue_cond:
        tc._download.remove(job)
        tc._current = job
        tc._requeue_canceled(job)
    assert list(tc._playlist) == []
    assert list(tc._download) == [job]
    assert job.prewarm_class == "download"
    assert job.urgent is False
    assert job.cancel_requested is False
