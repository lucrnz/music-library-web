"""API serializer shapes without HTTP."""

from musicweb.db.models import Album, Artist, Track, TrackLyrics
from musicweb.db.va import VA_ARTIST_ID, VA_DISPLAY_NAME
from musicweb.routes.serializers import album_dict, artist_dict, lyrics_dict, track_dict


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
    assert body["artist_browsable"] is False


def test_artist_dict_includes_preferred_keys():
    artist = Artist(
        id="art",
        name="Artist",
        name_norm="artist",
        sort_name="artist",
        album_count=1,
        track_count=1,
        has_image=True,
        has_preferred_image=True,
        preferred_rev=4,
    )
    body = artist_dict(artist)
    assert body["has_image"] is True
    assert body["has_preferred_image"] is True
    assert body["preferred_rev"] == 4
    assert body["id"] == "art"
    assert body["name"] == "Artist"
    assert body["is_va"] is False


def test_artist_dict_is_va_for_canonical_id():
    artist = Artist(
        id=VA_ARTIST_ID,
        name=VA_DISPLAY_NAME,
        name_norm="various artists",
        sort_name="various artists",
        album_count=1,
        track_count=1,
    )
    assert artist_dict(artist)["is_va"] is True


def test_track_dict_artist_browsable_kwarg():
    album = Album(
        id="alb",
        artist_id="art",
        title="Album",
        title_norm="album",
        track_count=1,
        has_cover=False,
    )
    track = _track()
    track.album = album
    assert track_dict(track, artist_browsable=True)["artist_browsable"] is True


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
    body = album_dict(album)
    assert body["lossy_kind"] == "mixed"
    assert body["duration_ms"] is None
    assert body["duration"] is None


def test_album_dict_includes_duration():
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
        duration_ms=2912000,
        has_cover=False,
    )
    album.album_artist = artist
    body = album_dict(album)
    assert body["duration_ms"] == 2912000
    assert body["duration"] == 2912.0


def test_track_dict_includes_bitrate_mode():
    album = Album(
        id="alb",
        artist_id="art",
        title="Album",
        title_norm="album",
        track_count=1,
        has_cover=False,
        lossy_kind="mp3",
    )
    vbr = _track(is_lossy=True, source_codec="mp3", bitrate_kbps=192, bitrate_mode="vbr")
    vbr.album = album
    body = track_dict(vbr)
    assert body["bitrate_kbps"] == 192
    assert body["bitrate_mode"] == "vbr"

    unset = _track()
    unset.album = album
    assert track_dict(unset)["bitrate_mode"] is None


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
