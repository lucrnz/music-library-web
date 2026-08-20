"""Now-playing serializer: faces, seconds position, no queue spoilers."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from musicweb.radio.now_playing import serialize
from musicweb.radio.types import SnapshotAlbum, SnapshotTrack, StationSnapshot
from musicweb.routes.radio import NowPlayingHub, push_now_playing


def _track(**overrides) -> SnapshotTrack:
    fields = dict(
        id="t1",
        rel_path="a.flac",
        is_missing=False,
        title="Song",
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
    fields.update(overrides)
    return SnapshotTrack(**fields)


def test_non_current_faces_have_no_track_fields():
    for face in ("catching_up", "skip_pending", "idle"):
        body = serialize(
            StationSnapshot(face=face, started_at=None, duration_ms=None, track=None)
        )
        assert body == {"face": face}
        assert "id" not in body
        assert "title" not in body
        assert "next" not in body
        assert "queue" not in body
        assert "batch" not in body


def test_current_includes_track_and_position_seconds():
    started = datetime(2026, 1, 1, tzinfo=timezone.utc)
    now = started + timedelta(seconds=12.5)
    body = serialize(
        StationSnapshot(
            face="current",
            started_at=started,
            duration_ms=180_000,
            track=_track(),
        ),
        now=now,
    )
    assert body["face"] == "current"
    assert body["id"] == "t1"
    assert body["title"] == "Song"
    assert body["artist"] == "Artist"
    assert body["album"] == "Album"
    assert body["is_lossy"] is False
    assert body["position"] == 12.5
    assert body["duration"] == 180.0
    for key in body:
        assert "next" not in key
        assert "queue" not in key
        assert "batch" not in key


def test_position_clamped_to_duration():
    started = datetime(2026, 1, 1, tzinfo=timezone.utc)
    body = serialize(
        StationSnapshot(
            face="current",
            started_at=started,
            duration_ms=10_000,
            track=_track(duration_ms=10_000),
        ),
        now=started + timedelta(seconds=99),
    )
    assert body["position"] == 10.0


def test_missing_current_does_not_call_track_dict():
    body = serialize(
        StationSnapshot(
            face="current",
            started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            duration_ms=10_000,
            track=None,
        )
    )
    assert body == {"face": "current"}


def test_listener_pushes_serialized_snapshot():
    started = datetime(2026, 1, 1, tzinfo=timezone.utc)
    snap = StationSnapshot(
        face="current",
        started_at=started,
        duration_ms=60_000,
        track=_track(),
    )
    station = SimpleNamespace(now_playing=lambda: snap)
    sent: list[dict] = []
    hub = NowPlayingHub()
    hub.schedule = sent.append  # type: ignore[method-assign]
    payload = push_now_playing(
        station,  # type: ignore[arg-type]
        hub,
        now=started + timedelta(seconds=3),
    )
    assert sent == [payload]
    assert payload["position"] == 3.0
    assert "queue" not in payload
