"""VA portrait is packaged, never fetched, never preferred."""

from io import BytesIO

import pytest
from PIL import Image

from musicweb.artist_images.fetch import ArtistImageFetcher
from musicweb.artist_images.preferred import PreferredImageForbidden, apply_preferred_upload
from musicweb.db.models import Artist
from musicweb.db.va import VA_ARTIST_ID, VA_DISPLAY_NAME
from musicweb.images import WebpAssetStore, placeholder_webp, va_portrait_webp
from musicweb.library import Library
from musicweb.scan.identity import ensure_artist


def _png_bytes() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (32, 32), (10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()


def _va_artist() -> Artist:
    return Artist(
        id=VA_ARTIST_ID,
        name=VA_DISPLAY_NAME,
        name_norm="various artists",
        sort_name="various artists",
        album_count=1,
        track_count=1,
    )


def test_packaged_webp_is_not_gray_placeholder():
    full = va_portrait_webp("full")
    thumb = va_portrait_webp("thumb")
    assert full[:4] == b"RIFF"
    assert thumb[:4] == b"RIFF"
    assert full != placeholder_webp("full")
    assert len(full) > len(placeholder_webp("full"))


def test_needs_fetch_false_even_when_forced(tmp_home):
    store = WebpAssetStore(tmp_home.data / "covers" / "artists")
    lib = Library(tmp_home.lib)
    fetcher = ArtistImageFetcher(store, lib, tmp_home.settings)
    artist = _va_artist()
    assert fetcher.needs_fetch(artist, force=False) is False
    assert fetcher.needs_fetch(artist, force=True) is False


def test_fetch_one_skips_va(db, tmp_home):
    store = WebpAssetStore(tmp_home.data / "covers" / "artists")
    lib = Library(tmp_home.lib)
    fetcher = ArtistImageFetcher(store, lib, tmp_home.settings)
    with db.session() as session:
        artist = ensure_artist(session, VA_DISPLAY_NAME)
        result = fetcher.fetch_one(session, artist, force=True)
        assert result.ok is False
        assert result.status == "skipped"
        session.commit()
    assert store.has(VA_ARTIST_ID) is False


def test_preferred_upload_forbidden(tmp_path):
    store = WebpAssetStore(tmp_path / "artists-preferred")
    with pytest.raises(PreferredImageForbidden):
        apply_preferred_upload(store, _va_artist(), _png_bytes())
    assert store.has(VA_ARTIST_ID) is False
