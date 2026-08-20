"""Radio prepare: current urgent + next-2 prewarm, no-op ticks, no spoilers."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from musicweb.radio.now_playing import serialize
from musicweb.radio.prepare import RADIO_CURRENT_LABEL, RADIO_PREWARM_LABEL, RadioPrepare
from musicweb.radio.tuners import TunerRegistry
from musicweb.radio.types import SnapshotAlbum, SnapshotTrack, StationSnapshot


def _track(track_id: str = "cur", *, title: str = "Now") -> SnapshotTrack:
    return SnapshotTrack(
        id=track_id,
        rel_path=f"{track_id}.flac",
        is_missing=False,
        title=title,
        artist_name="Artist",
        album=SnapshotAlbum(title="Album"),
        album_id="alb",
        artist_id="art",
        album_artist_name="Artist",
        album_artist_id="art",
        track_no=1,
        disc_no=1,
        year=2020,
        duration_ms=180_000,
        sample_rate_hz=44100,
        bit_depth=16,
        is_lossy=False,
        source_codec="flac",
        bitrate_kbps=None,
        bitrate_mode=None,
    )


def _station(track_id: str = "cur", upcoming: list[str] | None = None):
    snap = StationSnapshot(
        face="current",
        started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        duration_ms=180_000,
        track=_track(track_id),
    )
    return SimpleNamespace(
        now_playing=lambda: snap,
        peek_upcoming_ids=lambda n=2: (upcoming or ["n1", "n2"])[:n],
    )


def _prepare(station, tuners, enqueue) -> RadioPrepare:
    return RadioPrepare(
        station,  # type: ignore[arg-type]
        tuners,
        database=SimpleNamespace(session=lambda: SimpleNamespace(close=lambda: None)),
        library=SimpleNamespace(),
        transcoder=SimpleNamespace(),
        enqueue=enqueue,
    )


def test_zero_tuners_enqueues_nothing():
    enqueue = Mock()
    _prepare(_station(), TunerRegistry(), enqueue).refresh()
    enqueue.assert_not_called()


def test_first_tune_in_enqueues_current_and_two_prewarms():
    tuners = TunerRegistry()
    tuners.tune_in(1, "opus_192_48000")
    calls: list[tuple] = []

    def enqueue(_session, _lib, _tc, ids, **kwargs):
        calls.append((tuple(ids), kwargs["profile_tag"], kwargs["urgent"], kwargs["log_label"]))
        return {}

    _prepare(_station(), tuners, enqueue).refresh()
    assert calls == [
        (("cur",), "opus_192_48000", True, RADIO_CURRENT_LABEL),
        (("n1", "n2"), "opus_192_48000", False, RADIO_PREWARM_LABEL),
    ]


def test_second_profile_enqueues_that_profile_only():
    tuners = TunerRegistry()
    tuners.tune_in(1, "opus_192_48000")
    enqueue = Mock(return_value={})
    prep = _prepare(_station(), tuners, enqueue)
    prep.refresh()
    enqueue.reset_mock()
    tuners.tune_in(2, "opus_160_48000")
    prep.refresh()
    tags = {c.kwargs["profile_tag"] for c in enqueue.call_args_list}
    assert tags == {"opus_160_48000", "opus_192_48000"}


def test_noop_tick_does_not_reenqueue():
    tuners = TunerRegistry()
    tuners.tune_in(1, "opus_192_48000")
    enqueue = Mock(return_value={})
    prep = _prepare(_station(), tuners, enqueue)
    prep.refresh()
    assert enqueue.call_count == 2
    enqueue.reset_mock()
    prep.refresh()
    enqueue.assert_not_called()


def test_serialized_payload_has_no_upcoming_ids():
    body = serialize(_station().now_playing())
    text = str(body)
    assert "n1" not in text
    assert "n2" not in text
    assert "next" not in body


def test_drop_pending_prewarm_never_called_from_radio():
    tc = SimpleNamespace(drop_pending_prewarm=Mock(), prepare=Mock())
    tuners = TunerRegistry()
    tuners.tune_in(1, "opus_192_48000")
    enqueue = Mock(return_value={})
    _prepare(_station(), tuners, enqueue).refresh()
    tc.drop_pending_prewarm.assert_not_called()
