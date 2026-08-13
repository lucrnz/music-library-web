"""Once-per-track-id null tech warning."""

from types import SimpleNamespace

from musicweb.transcode.null_tech_log import (
    clear_null_tech_warnings,
    warn_null_track_tech,
)


def test_warn_null_track_tech_once_per_id(caplog):
    clear_null_tech_warnings()
    track = SimpleNamespace(
        id="t1", sample_rate_hz=None, bit_depth=None
    )
    with caplog.at_level("WARNING"):
        warn_null_track_tech(track)
        warn_null_track_tech(track)
    msgs = [r.message for r in caplog.records if "null audio tech" in r.message]
    assert len(msgs) == 1


def test_warn_skips_when_tech_present(caplog):
    clear_null_tech_warnings()
    track = SimpleNamespace(
        id="t2", sample_rate_hz=44100, bit_depth=16
    )
    with caplog.at_level("WARNING"):
        warn_null_track_tech(track)
    assert not any("null audio tech" in r.message for r in caplog.records)
