"""Tuner registry + tune_in / tune_out decision frames."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from musicweb.radio.protocol import ERROR_CODEC_REJECTED, ERROR_STATION_NOT_CURRENT
from musicweb.radio.tuners import TunerRegistry, apply_tune_in, apply_tune_out
from musicweb.radio.types import SnapshotTrack, StationSnapshot


def _station(face: str, *, track_id: str | None = "t1"):
    track = None
    if face == "current" and track_id:
        track = SimpleNamespace(id=track_id)
    snap = StationSnapshot(
        face=face,
        started_at=datetime(2026, 1, 1, tzinfo=timezone.utc) if face == "current" else None,
        duration_ms=180_000 if face == "current" else None,
        track=track,  # type: ignore[arg-type]
    )
    return SimpleNamespace(now_playing=lambda: snap)


def test_tune_in_rejected_when_station_not_current():
    tuners = TunerRegistry()
    prepare = SimpleNamespace(refresh=Mock())
    for face in ("catching_up", "skip_pending", "idle"):
        reply = apply_tune_in(_station(face), tuners, prepare, 1, "opus_192_48000")
        assert reply == {
            "ok": False,
            "error": ERROR_STATION_NOT_CURRENT,
            "face": face,
        }
        assert tuners.count() == 0
        prepare.refresh.assert_not_called()


def test_source_exclusive_unknown_codec_rejected():
    tuners = TunerRegistry()
    prepare = SimpleNamespace(refresh=Mock())
    station = _station("current")
    for codec in ("source", "flac_24_192000", "nope"):
        reply = apply_tune_in(station, tuners, prepare, 1, codec)
        assert reply["error"] == ERROR_CODEC_REJECTED
        assert tuners.count() == 0
    prepare.refresh.assert_not_called()


def test_first_tune_in_registers_and_prepares():
    tuners = TunerRegistry()
    prepare = SimpleNamespace(refresh=Mock())
    reply = apply_tune_in(_station("current"), tuners, prepare, 1, "opus_192_48000")
    assert reply == {"ok": True}
    assert tuners.count() == 1
    assert tuners.profiles() == {"opus_192_48000"}
    prepare.refresh.assert_called_once()


def test_second_tune_in_same_socket_is_idempotent():
    tuners = TunerRegistry()
    prepare = SimpleNamespace(refresh=Mock())
    station = _station("current")
    apply_tune_in(station, tuners, prepare, 1, "opus_192_48000")
    prepare.refresh.reset_mock()
    reply = apply_tune_in(station, tuners, prepare, 1, "opus_192_48000")
    assert reply == {"ok": True}
    assert tuners.count() == 1
    prepare.refresh.assert_not_called()


def test_profile_replace_updates_union():
    tuners = TunerRegistry()
    prepare = SimpleNamespace(refresh=Mock())
    station = _station("current")
    apply_tune_in(station, tuners, prepare, 1, "opus_192_48000")
    prepare.refresh.reset_mock()
    apply_tune_in(station, tuners, prepare, 1, "opus_160_48000")
    assert tuners.count() == 1
    assert tuners.profiles() == {"opus_160_48000"}
    prepare.refresh.assert_called_once()


def test_tune_out_and_last_tuner_returns_to_simulation():
    tuners = TunerRegistry()
    prepare = SimpleNamespace(refresh=Mock())
    apply_tune_in(_station("current"), tuners, prepare, 1, "opus_192_48000")
    reply = apply_tune_out(tuners, 1)
    assert reply == {"ok": True}
    assert tuners.count() == 0
