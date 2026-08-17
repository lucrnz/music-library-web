"""Shared JSON shapes for discovery / playlist / media APIs."""

from __future__ import annotations

from musicweb.db.models import Album, Artist, Track, TrackLyrics


def track_dict(track: Track) -> dict:
    return {
        "id": track.id,
        "path": track.rel_path if not track.is_missing else None,
        "title": track.title,
        "artist": track.artist_name,
        "album": track.album.title if track.album else "",
        "album_id": track.album_id,
        "artist_id": track.artist_id,
        "album_artist": track.album_artist_name,
        "album_artist_id": track.album_artist_id,
        "track": track.track_no,
        "disc": track.disc_no,
        "year": track.year,
        "duration": (track.duration_ms / 1000.0) if track.duration_ms is not None else None,
        "duration_ms": track.duration_ms,
        "is_missing": track.is_missing,
        "sample_rate_hz": track.sample_rate_hz,
        "bit_depth": track.bit_depth,
        "is_lossy": bool(track.is_lossy),
        "source_codec": track.source_codec,
        "bitrate_kbps": track.bitrate_kbps,
    }


def artist_dict(artist: Artist) -> dict:
    return {
        "id": artist.id,
        "name": artist.name,
        "sort_name": artist.sort_name,
        "album_count": artist.album_count,
        "track_count": artist.track_count,
        "has_image": bool(artist.has_image),
        "has_preferred_image": bool(artist.has_preferred_image),
        "preferred_rev": int(artist.preferred_rev or 0),
    }


def album_dict(album: Album, *, artist_name: str | None = None) -> dict:
    name = artist_name
    if name is None and album.album_artist is not None:
        name = album.album_artist.name
    return {
        "id": album.id,
        "title": album.title,
        "artist_id": album.artist_id,
        "artist": name or "",
        "year": album.year,
        "track_count": album.track_count,
        "has_cover": album.has_cover,
        "lossy_kind": album.lossy_kind,
    }


def lyrics_dict(track_id: str, row: TrackLyrics | None) -> dict:
    """API shape for GET /api/tracks/{id}/lyrics (never 404 for missing row)."""
    if row is None:
        return {
            "track_id": track_id,
            "status": "pending",
            "source": None,
            "is_synced": False,
            "plain_text": None,
            "synced_lrc": None,
            "instrumental": False,
        }
    status = row.status or "not_found"
    instrumental = status == "instrumental"
    return {
        "track_id": track_id,
        "status": status,
        "source": row.source,
        "is_synced": bool(row.is_synced and row.synced_lrc and not instrumental),
        "plain_text": None if instrumental else row.plain_text,
        "synced_lrc": None if instrumental else row.synced_lrc,
        "instrumental": instrumental,
    }
