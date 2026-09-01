"""SQL remount of existing VA-alias artist/album rows."""

from sqlalchemy import select

from musicweb.cover import CoverStore
from musicweb.db.fts import fts_search_track_ids, fts_upsert
from musicweb.db.models import Album, Artist, Track
from musicweb.db.names import album_id_for, artist_id_for, normalize_name, sort_name
from musicweb.db.va import VA_ARTIST_ID, VA_DISPLAY_NAME
from musicweb.scan.finalize import recount_entities
from musicweb.scan.va_remount import remount_va


def _legacy_artist(session, name: str) -> Artist:
    name_norm = normalize_name(name)
    artist = Artist(
        id=artist_id_for(name_norm),
        name=name,
        name_norm=name_norm,
        sort_name=sort_name(name),
        album_count=0,
        track_count=0,
    )
    session.add(artist)
    session.flush()
    return artist


def _album(session, artist: Artist, title: str, title_norm: str) -> Album:
    album = Album(
        id=album_id_for(artist.id, title_norm),
        artist_id=artist.id,
        title=title,
        title_norm=title_norm,
        track_count=0,
        has_cover=False,
    )
    session.add(album)
    session.flush()
    return album


def _track(
    session,
    *,
    tid: str,
    album: Album,
    artist_name: str,
    artist_id: str,
    album_artist_name: str,
    album_artist_id: str,
    title: str,
) -> Track:
    track = Track(
        id=tid,
        fingerprint=f"fp-{tid}",
        fingerprint_algo="sha256",
        rel_path=f"{tid}.flac",
        title=title,
        artist_name=artist_name,
        album_artist_name=album_artist_name,
        artist_id=artist_id,
        album_id=album.id,
        album_artist_id=album_artist_id,
        size_bytes=1,
        mtime_ns=1,
        is_missing=False,
        added_at="t",
        indexed_at="t",
    )
    session.add(track)
    session.flush()
    fts_upsert(
        session,
        track_id=track.id,
        title=track.title,
        artist_name=track.artist_name,
        album_title=album.title,
        album_artist_name=track.album_artist_name,
    )
    return track


def test_remount_collapses_aliases_and_merges_same_title(db, tmp_home):
    covers = CoverStore(tmp_home.data)
    with db.session() as session:
        va_alias = _legacy_artist(session, "VA")
        omni = _legacy_artist(session, "オムニバス")
        nirvana = _legacy_artist(session, "Nirvana")
        va_alias_id = va_alias.id
        omni_id = omni.id
        assert va_alias_id != VA_ARTIST_ID
        assert omni_id != VA_ARTIST_ID

        hits_va = _album(session, va_alias, "Greatest Hits", "greatest hits")
        hits_omni = _album(session, omni, "Greatest Hits", "greatest hits")
        other = _album(session, omni, "Now 1997", "now 1997")

        for size in ("full", "thumb"):
            path = covers.path_for(hits_va.id, size)
            path.write_bytes(b"cover-" + size.encode())

        guest = _track(
            session,
            tid="t-guest",
            album=hits_va,
            artist_name="Nirvana",
            artist_id=nirvana.id,
            album_artist_name="VA",
            album_artist_id=va_alias.id,
            title="Smells Like Teen Spirit",
        )
        tagged_va = _track(
            session,
            tid="t-va",
            album=hits_omni,
            artist_name="V.A.",
            artist_id=omni.id,
            album_artist_name="オムニバス",
            album_artist_id=omni.id,
            title="Intro",
        )
        other_track = _track(
            session,
            tid="t-other",
            album=other,
            artist_name="Bon Jovi",
            artist_id=nirvana.id,
            album_artist_name="オムニバス",
            album_artist_id=omni.id,
            title="Livin' on a Prayer",
        )
        guest_id = guest.id
        tagged_id = tagged_va.id
        other_id = other_track.id
        old_hits_id = hits_va.id
        session.commit()

    with db.session() as session:
        remount_va(session, covers)
        recount_entities(session)
        session.commit()

        va = session.get(Artist, VA_ARTIST_ID)
        assert va is not None
        assert va.name == VA_DISPLAY_NAME

        assert session.get(Artist, va_alias_id) is None
        assert session.get(Artist, omni_id) is None

        albums = list(session.scalars(select(Album)).all())
        assert {a.artist_id for a in albums} == {VA_ARTIST_ID}
        titles = sorted(a.title for a in albums)
        assert titles == ["Greatest Hits", "Now 1997"]
        hits = next(a for a in albums if a.title == "Greatest Hits")
        assert hits.id == album_id_for(VA_ARTIST_ID, "greatest hits")
        assert hits.id != old_hits_id
        assert covers.store.has(hits.id)
        assert not covers.path_for(old_hits_id, "full").exists()

        guest = session.get(Track, guest_id)
        tagged = session.get(Track, tagged_id)
        other = session.get(Track, other_id)
        assert guest is not None and tagged is not None and other is not None
        assert guest.id == guest_id
        assert guest.album_id == hits.id
        assert guest.artist_name == "Nirvana"
        assert guest.album_artist_name == VA_DISPLAY_NAME
        assert guest.album_artist_id == VA_ARTIST_ID
        assert tagged.artist_name == VA_DISPLAY_NAME
        assert tagged.artist_id == VA_ARTIST_ID
        assert tagged.album_id == hits.id
        assert other.album_artist_name == VA_DISPLAY_NAME
        assert other.album_id == album_id_for(VA_ARTIST_ID, "now 1997")

        assert va.album_count == 2
        assert fts_search_track_ids(session, "smells") == [guest_id]
        assert set(fts_search_track_ids(session, "various")) == {
            guest_id,
            tagged_id,
            other_id,
        }
