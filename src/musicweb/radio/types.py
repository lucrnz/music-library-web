"""Snapshot types for the radio catalog, picker, and station face."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import object_session

from musicweb.db.models import Artist, Track


@dataclass(frozen=True, slots=True)
class EligibleRow:
    """Present eligible index row (unresolved path)."""

    id: str
    rel_path: str
    duration_ms: int
    album_id: str
    album_artist_id: str
    artist_id: str


@dataclass(frozen=True, slots=True)
class CatalogTrack:
    """Resolved eligible track used by the picker."""

    id: str
    duration_ms: int
    path: Path
    album_id: str
    album_artist_id: str
    artist_id: str


@dataclass
class CatalogSnapshot:
    """Performer → album → tracks graph of eligible radio tracks."""

    artists: dict[str, dict[str, list[CatalogTrack]]]

    def copy(self) -> CatalogSnapshot:
        artists: dict[str, dict[str, list[CatalogTrack]]] = {}
        for artist_id, albums in self.artists.items():
            artists[artist_id] = {album_id: list(tracks) for album_id, tracks in albums.items()}
        return CatalogSnapshot(artists=artists)

    def remove_track(self, track_id: str) -> None:
        empty_artists: list[str] = []
        for artist_id, albums in self.artists.items():
            empty_albums: list[str] = []
            for album_id, tracks in albums.items():
                kept = [t for t in tracks if t.id != track_id]
                if kept:
                    albums[album_id] = kept
                else:
                    empty_albums.append(album_id)
            for album_id in empty_albums:
                del albums[album_id]
            if not albums:
                empty_artists.append(artist_id)
        for artist_id in empty_artists:
            del self.artists[artist_id]

    def all_tracks(self) -> list[CatalogTrack]:
        out: list[CatalogTrack] = []
        for albums in self.artists.values():
            for tracks in albums.values():
                out.extend(tracks)
        return out


@dataclass(frozen=True, slots=True)
class SnapshotAlbum:
    title: str


@dataclass(frozen=True, slots=True)
class SnapshotTrack:
    """Display/tech fields copied from a Track row (no live session)."""

    id: str
    rel_path: str | None
    is_missing: bool
    title: str
    artist_name: str
    album: SnapshotAlbum | None
    album_id: str | None
    artist_id: str | None
    album_artist_name: str
    album_artist_id: str | None
    track_no: int | None
    disc_no: int | None
    year: int | None
    duration_ms: int | None
    sample_rate_hz: int | None
    bit_depth: int | None
    is_lossy: bool
    source_codec: str | None
    bitrate_kbps: int | None
    bitrate_mode: str | None
    artist_browsable: bool = False

    @staticmethod
    def from_track(row: Track) -> SnapshotTrack:
        album = SnapshotAlbum(title=row.album.title) if row.album is not None else None
        browsable = False
        if row.artist_id:
            sess = object_session(row)
            if sess is not None:
                artist = sess.get(Artist, row.artist_id)
                browsable = artist is not None and artist.album_count > 0
        return SnapshotTrack(
            id=row.id,
            rel_path=row.rel_path,
            is_missing=bool(row.is_missing),
            title=row.title,
            artist_name=row.artist_name,
            album=album,
            album_id=row.album_id,
            artist_id=row.artist_id,
            album_artist_name=row.album_artist_name,
            album_artist_id=row.album_artist_id,
            track_no=row.track_no,
            disc_no=row.disc_no,
            year=row.year,
            duration_ms=row.duration_ms,
            sample_rate_hz=row.sample_rate_hz,
            bit_depth=row.bit_depth,
            is_lossy=bool(row.is_lossy),
            source_codec=row.source_codec,
            bitrate_kbps=row.bitrate_kbps,
            bitrate_mode=row.bitrate_mode,
            artist_browsable=browsable,
        )


@dataclass(frozen=True, slots=True)
class StationSnapshot:
    """In-memory station face. Not a route DTO."""

    face: str
    started_at: datetime | None
    duration_ms: int | None
    track: SnapshotTrack | None

    def position_seconds(self, now: datetime) -> float | None:
        if self.face != "current" or self.started_at is None or self.duration_ms is None:
            return None
        duration_s = self.duration_ms / 1000.0
        pos = (now - self.started_at).total_seconds()
        if pos < 0:
            return 0.0
        if pos > duration_s:
            return duration_s
        return pos


@dataclass(frozen=True, slots=True)
class DebugMutationResult:
    """Result of a debug DJ mutation. Not a route DTO."""

    ok: bool
    error: str | None = None
    changed_current: bool = False
    changed_started_at: bool = False
