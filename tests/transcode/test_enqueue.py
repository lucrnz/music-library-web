"""enqueue_prepare skips lossy / missing and forwards log_label."""

from types import SimpleNamespace
from unittest.mock import Mock

from musicweb.transcode.enqueue import enqueue_prepare


def test_skips_lossy_and_missing_forwards_label(monkeypatch):
    lossless = SimpleNamespace(
        id="ok",
        is_missing=False,
        rel_path="ok.flac",
        is_lossy=False,
        sample_rate_hz=44100,
        bit_depth=16,
        channels=2,
        source_codec="flac",
    )
    lossy = SimpleNamespace(
        id="mp3",
        is_missing=False,
        rel_path="x.mp3",
        is_lossy=True,
    )
    missing = SimpleNamespace(
        id="gone",
        is_missing=True,
        rel_path=None,
        is_lossy=False,
    )
    monkeypatch.setattr(
        "musicweb.transcode.enqueue.tracks_repo.get_many",
        lambda _session, _ids: [lossless, lossy, missing],
    )
    path = SimpleNamespace(is_file=lambda: True)
    lib = SimpleNamespace(resolve=lambda _rel: path, is_audio=lambda _p: True)
    tc = SimpleNamespace(prepare=Mock(return_value="queued"))
    counts = enqueue_prepare(
        SimpleNamespace(),
        lib,
        tc,
        ["ok", "mp3", "gone"],
        profile_tag="opus_192_48000",
        urgent=True,
        log_label="radio current",
    )
    assert counts["queued"] == 1
    assert counts["skipped"] == 2
    tc.prepare.assert_called_once()
    assert tc.prepare.call_args.kwargs["log_label"] == "radio current"
    assert tc.prepare.call_args.kwargs["urgent"] is True


def test_job_log_label_prefers_radio_label():
    from musicweb.transcode.worker import _Job, job_log_label
    from musicweb.transcode.profiles import get_profile

    job = _Job(
        key="k",
        source=SimpleNamespace(),
        relative_path="secret/upcoming.flac",
        profile=get_profile("opus_192_48000"),
        urgent=False,
        log_label="radio prewarm",
    )
    assert job_log_label(job) == "radio prewarm"
    job.log_label = None
    assert job_log_label(job) == "secret/upcoming.flac"
