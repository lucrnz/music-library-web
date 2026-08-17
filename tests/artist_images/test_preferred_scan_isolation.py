"""Force regen must not delete preferred files or clear preferred flags."""

from io import BytesIO

from PIL import Image

from musicweb.artist_image import ArtistImageStore
from musicweb.artist_images import ArtistImageFetcher
from musicweb.db.models import Artist
from musicweb.images import WebpAssetStore
from musicweb.library import Library


def _png_bytes() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (32, 32), (10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()


def test_force_regen_leaves_preferred_store_and_flags(tmp_home, db):
    preferred = WebpAssetStore(tmp_home.data / "covers" / "artists-preferred")
    assert preferred.write_from_bytes("art1", _png_bytes())
    assert preferred.has("art1")

    with db.session() as session:
        session.add(
            Artist(
                id="art1",
                name="Artist",
                name_norm="artist",
                sort_name="artist",
                album_count=0,
                track_count=0,
                has_image=False,
                has_preferred_image=True,
                preferred_rev=3,
            )
        )
        session.commit()

    fetcher = ArtistImageFetcher(
        ArtistImageStore(tmp_home.data),
        Library(tmp_home.lib),
        tmp_home.settings,
        providers=[],
    )
    with db.session() as session:
        artist = session.get(Artist, "art1")
        assert artist is not None
        fetcher.fetch_one(session, artist, force=True)
        session.commit()

    assert preferred.has("art1")
    with db.session() as session:
        artist = session.get(Artist, "art1")
        assert artist is not None
        assert artist.has_preferred_image is True
        assert artist.preferred_rev == 3
