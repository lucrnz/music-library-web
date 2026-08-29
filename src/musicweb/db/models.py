"""ORM models for the music library index."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from musicweb.db.base import Base


class Artist(Base):
    __tablename__ = "artists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    name_norm: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    sort_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    album_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    track_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    has_image: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_preferred_image: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    preferred_rev: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mbid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    image_source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    image_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    image_fetched_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    albums: Mapped[list[Album]] = relationship(
        back_populates="album_artist",
        foreign_keys="Album.artist_id",
    )


class Album(Base):
    __tablename__ = "albums"
    __table_args__ = (
        UniqueConstraint("artist_id", "title_norm", name="uq_album_artist_title"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    artist_id: Mapped[str] = mapped_column(
        ForeignKey("artists.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    title_norm: Mapped[str] = mapped_column(String, nullable=False)
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    track_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # NULL = no present tracks, or any present track lacks duration_ms.
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    has_cover: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # NULL = no present lossy tracks; else mp3 | aac | mixed
    lossy_kind: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    album_artist: Mapped[Artist] = relationship(
        back_populates="albums",
        foreign_keys=[artist_id],
    )
    tracks: Mapped[list[Track]] = relationship(back_populates="album")


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    fingerprint_algo: Mapped[str] = mapped_column(String, nullable=False)
    # NULL when is_missing (SQLite UNIQUE allows multiple NULLs).
    rel_path: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    artist_name: Mapped[str] = mapped_column(String, nullable=False)
    album_artist_name: Mapped[str] = mapped_column(String, nullable=False)
    artist_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("artists.id"), nullable=True, index=True
    )
    album_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("albums.id"), nullable=True, index=True
    )
    album_artist_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("artists.id"), nullable=True, index=True
    )
    track_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    disc_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Source audio tech (from mutagen at scan; used for encode dither/rate policy).
    sample_rate_hz: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bit_depth: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    channels: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_codec: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_lossy: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    bitrate_kbps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bitrate_mode: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mtime_ns: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_missing: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )
    unripped: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    added_at: Mapped[str] = mapped_column(String, nullable=False)
    indexed_at: Mapped[str] = mapped_column(String, nullable=False)

    album: Mapped[Optional[Album]] = relationship(back_populates="tracks")
    lyrics: Mapped[Optional["TrackLyrics"]] = relationship(
        back_populates="track",
        uselist=False,
        cascade="all, delete-orphan",
    )


class TrackLyrics(Base):
    """Cached plain / synced lyrics for one track (local or LRCLIB)."""

    __tablename__ = "track_lyrics"

    track_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tracks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    status: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_synced: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    plain_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    synced_lrc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    match_fingerprint: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    fetched_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    track: Mapped[Track] = relationship(back_populates="lyrics")


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)

    items: Mapped[list[PlaylistTrack]] = relationship(
        back_populates="playlist",
        order_by="PlaylistTrack.position",
        cascade="all, delete-orphan",
    )


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    playlist_id: Mapped[str] = mapped_column(
        ForeignKey("playlists.id", ondelete="CASCADE"),
        primary_key=True,
    )
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    track_id: Mapped[str] = mapped_column(
        ForeignKey("tracks.id"), nullable=False, index=True
    )

    playlist: Mapped[Playlist] = relationship(back_populates="items")
    track: Mapped[Track] = relationship()


class ListenEvent(Base):
    """One counted household listen (track × profile × play source × origin)."""

    __tablename__ = "listen_events"
    __table_args__ = (
        Index("ix_listen_events_track_id_counted_at", "track_id", "counted_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    track_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tracks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_tag: Mapped[str] = mapped_column(String, nullable=False)
    play_source: Mapped[str] = mapped_column(String, nullable=False)
    origin: Mapped[str] = mapped_column(
        String, nullable=False, default="queue", server_default="queue"
    )
    counted_at: Mapped[str] = mapped_column(String, nullable=False, index=True)
    month_key: Mapped[str] = mapped_column(String, nullable=False, index=True)


class ScanState(Base):
    """Single-row library job status (scan or regen kinds)."""

    __tablename__ = "scan_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="idle")
    # scan | regen-covers | regen-artist-images | regen-lyrics
    kind: Mapped[str] = mapped_column(String, nullable=False, default="scan")
    mode: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    force: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    started_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    finished_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_scan_finished_at: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )
    phase: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Scan-only counters; leave 0 for regen kinds.
    files_seen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_upserted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_missing: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_total_hint: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    current_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class CdIdentity(Base):
    """Remembered MusicBrainz pick for one disc id (TOC)."""

    __tablename__ = "cd_identities"

    discid: Mapped[str] = mapped_column(String, primary_key=True)
    release_mbid: Mapped[str] = mapped_column(String, nullable=False)
    toc_json: Mapped[str] = mapped_column(Text, nullable=False)
    confirmed_at: Mapped[str] = mapped_column(String, nullable=False)
    album_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    album: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    artist: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    has_cover: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tracks_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class RadioStationState(Base):
    """Singleton household radio clock. Track ids have no FK."""

    __tablename__ = "radio_station"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    current_track_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    track_started_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    current_batch_seq: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class RadioQueueItem(Base):
    """Persisted current (and next) radio batch rows. Track ids have no FK."""

    __tablename__ = "radio_queue"

    batch_seq: Mapped[int] = mapped_column(Integer, primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    track_id: Mapped[str] = mapped_column(String(36), nullable=False)


class RadioBanlistItem(Base):
    """Persisted picked-batch banlist. Track ids have no FK."""

    __tablename__ = "radio_banlist"

    batch_seq: Mapped[int] = mapped_column(Integer, primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    track_id: Mapped[str] = mapped_column(String(36), nullable=False)
