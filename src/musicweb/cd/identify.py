"""Lookup-only identify and confirm (bind or unripped stubs + snapshot)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from musicweb.cd.discid import disc_id
from musicweb.cd.musicbrainz import (
    MatchTrack,
    ReleaseMatch,
    fetch_cover,
    fetch_release,
    lookup_discid,
)
from musicweb.db.models import Album, Track
from musicweb.db.names import (
    album_id_for,
    display_name,
    normalize_name,
    track_id_for,
)
from musicweb.db.repositories import cd as cd_repo
from musicweb.scan.identity import ensure_album, ensure_artist
from musicweb.timeutil import utc_now_iso

CD_DISCID_ALGO = "cd-discid"


@dataclass(frozen=True)
class TocIn:
    first_track: int
    last_audio_track: int
    leadout_lba: int
    offsets: list[int]

    def to_json(self) -> str:
        return json.dumps(
            {
                "first_track": self.first_track,
                "last_audio_track": self.last_audio_track,
                "leadout_lba": self.leadout_lba,
                "offsets": list(self.offsets),
            },
            separators=(",", ":"),
        )

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> TocIn:
        offsets = [int(x) for x in (raw.get("offsets") or [])]
        return cls(
            first_track=int(raw["first_track"]),
            last_audio_track=int(raw["last_audio_track"]),
            leadout_lba=int(raw["leadout_lba"]),
            offsets=offsets,
        )


def compute_discid(toc: TocIn) -> str:
    return disc_id(
        toc.first_track, toc.last_audio_track, toc.leadout_lba, toc.offsets
    )


def duration_ms_for(toc: TocIn, track_no: int) -> int | None:
    index = track_no - toc.first_track
    if index < 0 or index >= len(toc.offsets):
        return None
    start = toc.offsets[index]
    end = (
        toc.leadout_lba
        if track_no == toc.last_audio_track
        else toc.offsets[index + 1]
    )
    sectors = end - start
    if sectors <= 0:
        return None
    return int(round(sectors * 1000 / 75))


def snapshot_dto(session: Session, discid: str) -> dict[str, Any] | None:
    row = cd_repo.get(session, discid)
    if row is None or not row.album_id or not row.tracks_json:
        return None
    try:
        tracks = json.loads(row.tracks_json)
    except json.JSONDecodeError:
        return None
    if not isinstance(tracks, list) or not tracks:
        return None
    return {
        "discid": row.discid,
        "release_mbid": row.release_mbid,
        "album_id": row.album_id,
        "album": row.album,
        "artist": row.artist,
        "year": row.year,
        "has_cover": bool(row.has_cover),
        "tracks": tracks,
    }


def lookup(
    session: Session,
    *,
    toc: TocIn,
    cd_text: dict[str, Any] | None,
    user_agent: str | None,
    http: Any | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Never writes. Returns discid + matches and optional applied snapshot."""
    ident = compute_discid(toc)
    if not force:
        applied = snapshot_dto(session, ident)
        if applied is not None:
            return {
                "discid": ident,
                "matches": [],
                "applied": applied,
                "cd_text": cd_text,
            }
    expected = toc.last_audio_track - toc.first_track + 1
    matches = lookup_discid(
        ident, user_agent=user_agent, http=http, audio_count=expected
    )
    return {
        "discid": ident,
        "matches": [m.to_picker_dict() for m in matches],
        "applied": None,
        "cd_text": cd_text,
    }


def get_applied(
    session: Session,
    discid: str,
    *,
    user_agent: str | None = None,
    http: Any | None = None,
    toc: TocIn | None = None,
) -> dict[str, Any] | None:
    return snapshot_dto(session, discid)


def _track_payload(
    track: Track, spec: MatchTrack, toc: TocIn
) -> dict[str, Any]:
    return {
        "id": track.id,
        "track_no": spec.track_no,
        "title": spec.title,
        "artist": spec.artist,
        "duration_ms": spec.duration_ms or duration_ms_for(toc, spec.track_no),
    }


def _present_slot(
    session: Session, album_id: str, track_no: int
) -> Track | None:
    candidates = list(
        session.scalars(
            select(Track).where(
                Track.album_id == album_id,
                Track.track_no == track_no,
                Track.is_missing.is_(False),
            )
        ).all()
    )
    return next((t for t in candidates if t.disc_no in (None, 1)), None)


def _present_count(session: Session, album_id: str) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(Track)
            .where(Track.album_id == album_id, Track.is_missing.is_(False))
        )
        or 0
    )


def _later_medium(match: ReleaseMatch) -> bool:
    return int(getattr(match, "medium_position", 1) or 1) > 1


def _try_bind(
    session: Session, match: ReleaseMatch, toc: TocIn
) -> tuple[Album, list[dict[str, Any]]] | None:
    from musicweb.db.names import artist_id_for

    if _later_medium(match):
        return None
    title_norm = normalize_name(display_name(match.title, match.title))
    artist_id = artist_id_for(normalize_name(display_name(match.artist, match.artist)))
    album_id = album_id_for(artist_id, title_norm)
    album = session.get(Album, album_id)
    if album is None:
        return None
    expected = toc.last_audio_track - toc.first_track + 1
    if _present_count(session, album.id) != expected:
        return None
    if match.tracks and len(match.tracks) != expected:
        return None
    specs = match.tracks or [
        MatchTrack(
            track_no=n,
            title=f"Track {n}",
            artist=match.artist,
            duration_ms=duration_ms_for(toc, n),
        )
        for n in range(toc.first_track, toc.last_audio_track + 1)
    ]
    rows: list[dict[str, Any]] = []
    for spec in specs:
        slot = _present_slot(session, album.id, spec.track_no)
        if slot is None:
            return None
        rows.append(_track_payload(slot, spec, toc))
    return album, rows


def _upsert_stub(
    session: Session,
    *,
    album: Album,
    artist_id: str,
    discid: str,
    match: ReleaseMatch,
    spec: MatchTrack,
    toc: TocIn,
    now: str,
) -> Track:
    fingerprint = f"{discid}:{spec.track_no}"
    tid = track_id_for(CD_DISCID_ALGO, fingerprint)
    track = session.get(Track, tid)
    duration = spec.duration_ms or duration_ms_for(toc, spec.track_no)
    if track is None:
        track = Track(
            id=tid,
            fingerprint=fingerprint,
            fingerprint_algo=CD_DISCID_ALGO,
            rel_path=None,
            title=spec.title,
            artist_name=spec.artist,
            album_artist_name=match.artist,
            artist_id=artist_id,
            album_id=album.id,
            album_artist_id=artist_id,
            track_no=spec.track_no,
            disc_no=1,
            year=match.year,
            duration_ms=duration,
            sample_rate_hz=44100,
            bit_depth=16,
            channels=2,
            source_codec="cdda",
            is_lossy=False,
            size_bytes=0,
            mtime_ns=0,
            is_missing=True,
            unripped=True,
            added_at=now,
            indexed_at=now,
        )
        session.add(track)
        return track
    track.title = spec.title
    track.artist_name = spec.artist
    track.album_artist_name = match.artist
    track.album_id = album.id
    track.artist_id = artist_id
    track.album_artist_id = artist_id
    track.track_no = spec.track_no
    track.duration_ms = duration
    if track.is_missing:
        track.rel_path = None
        track.fingerprint_algo = CD_DISCID_ALGO
        track.fingerprint = fingerprint
        track.unripped = True
    track.indexed_at = now
    return track


def _half_bind(
    session: Session,
    *,
    discid: str,
    match: ReleaseMatch,
    toc: TocIn,
    now: str,
) -> tuple[Album, list[dict[str, Any]]]:
    artist = ensure_artist(session, match.artist)
    album = ensure_album(session, artist, match.title, match.year)
    specs = match.tracks or [
        MatchTrack(
            track_no=n,
            title=f"Track {n}",
            artist=match.artist,
            duration_ms=duration_ms_for(toc, n),
        )
        for n in range(toc.first_track, toc.last_audio_track + 1)
    ]
    later = _later_medium(match)
    rows: list[dict[str, Any]] = []
    for spec in specs:
        if not later:
            present = _present_slot(session, album.id, spec.track_no)
            if present is not None:
                rows.append(_track_payload(present, spec, toc))
                continue
        stub = _upsert_stub(
            session,
            album=album,
            artist_id=artist.id,
            discid=discid,
            match=match,
            spec=spec,
            toc=toc,
            now=now,
        )
        rows.append(_track_payload(stub, spec, toc))
    session.flush()
    return album, rows


def _write_cover(cover_store: Any, album_id: str, data: bytes | None) -> bool:
    if not data or cover_store is None:
        return False
    store = getattr(cover_store, "store", cover_store)
    writer = getattr(store, "write_from_bytes", None)
    if writer is None:
        return False
    return bool(writer(album_id, data))


def confirm(
    session: Session,
    *,
    discid: str,
    release_mbid: str,
    toc: TocIn,
    user_agent: str | None,
    cover_store: Any | None,
    http: Any | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    expected = toc.last_audio_track - toc.first_track + 1
    match = fetch_release(
        release_mbid,
        user_agent=user_agent,
        http=http,
        discid=discid,
        audio_count=expected,
    )
    if match is None:
        hits = lookup_discid(
            discid,
            user_agent=user_agent,
            http=http,
            audio_count=expected,
        )
        match = next((m for m in hits if m.release_mbid == release_mbid), None)
    if match is None:
        raise ValueError("unknown release")
    stamp = now or utc_now_iso()
    bound = _try_bind(session, match, toc)
    if bound is None:
        album, tracks = _half_bind(
            session, discid=discid, match=match, toc=toc, now=stamp
        )
    else:
        album, tracks = bound
    if not album.has_cover:
        cover_bytes = fetch_cover(release_mbid, user_agent=user_agent, http=http)
        if _write_cover(cover_store, album.id, cover_bytes):
            album.has_cover = True
    cd_repo.upsert_identity(
        session,
        discid=discid,
        release_mbid=release_mbid,
        toc_json=toc.to_json(),
        confirmed_at=stamp,
        album_id=album.id,
        album=match.title,
        artist=match.artist,
        year=match.year,
        has_cover=bool(album.has_cover),
        tracks_json=json.dumps(tracks),
    )
    session.flush()
    dto = snapshot_dto(session, discid)
    if dto is None:
        raise ValueError("unknown release")
    return dto
