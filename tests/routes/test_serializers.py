"""API serializer shapes without HTTP."""

from musicweb.db.models import Album, Artist, Track, TrackLyrics
from musicweb.routes.serializers import album_dict, lyrics_dict, track_dict


def _track(**overrides) -> Track:
    values = dict(
        id="t1",
        fingerprint="fp",
        fingerprint_algo="sha256",
        rel_path="a/b.flac",
        title="Title",
        artist_name="Artist",
        album_artist_name="Artist",
        artist_id="art",
        album_id="alb",
        album_artist_id="art",
        size_bytes=1,
        mtime_ns=1,
        is_missing=False,
        added_at="t",
        indexed_at="t",
    )
    values.update(overrides)
    return Track(**values)


def test_track_dict_missing_path_is_null():
    album = Album(
        id="alb",
        artist_id="art",
        title="Album",
        title_norm="album",
        track_count=1,
        has_cover=False,
        lossy_kind=None,
    )
    track = _track(is_missing=True, rel_path=None)
    track.album = album
    body = track_dict(track)
    assert body["path"] is None
    assert body["is_missing"] is True


def test_album_dict_lossy_kind():
    artist = Artist(
        id="art",
        name="Artist",
        name_norm="artist",
        sort_name="artist",
        album_count=1,
        track_count=1,
    )
    album = Album(
        id="alb",
        artist_id="art",
        title="Album",
        title_norm="album",
        track_count=2,
        has_cover=False,
        lossy_kind="mixed",
    )
    album.album_artist = artist
    assert album_dict(album)["lossy_kind"] == "mixed"


def test_lyrics_dict_pending_and_instrumental():
    pending = lyrics_dict("t1", None)
    assert pending["status"] == "pending"
    assert pending["instrumental"] is False
    assert pending["plain_text"] is None

    row = TrackLyrics(
        track_id="t1",
        status="instrumental",
        source="lrclib",
        is_synced=True,
        plain_text="should hide",
        synced_lrc="[00:01.00]hide",
    )
    body = lyrics_dict("t1", row)
    assert body["instrumental"] is True
    assert body["plain_text"] is None
    assert body["synced_lrc"] is None
    assert body["is_synced"] is False
