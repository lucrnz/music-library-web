"""Preferred upload / revert helpers (no HTTP)."""

from io import BytesIO

import pytest
from PIL import Image

from musicweb.artist_images.preferred import (
    PreferredImageForbidden,
    PreferredImageTooLarge,
    PreferredImageUndecodable,
    apply_preferred_upload,
    revert_preferred,
)
from musicweb.db.va import VA_ARTIST_ID, VA_DISPLAY_NAME
from musicweb.config import ARTIST_IMAGE_MAX_BYTES
from musicweb.db.models import Artist
from musicweb.images import WebpAssetStore


def _png_bytes(color=(10, 20, 30)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (32, 32), color).save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (32, 32), (40, 50, 60)).save(buf, format="JPEG")
    return buf.getvalue()


def _artist() -> Artist:
    return Artist(
        id="art1",
        name="Artist",
        name_norm="artist",
        sort_name="artist",
        album_count=0,
        track_count=0,
        has_image=True,
        image_source="local",
        image_status="ok",
        image_fetched_at="t",
        mbid="mbid-1",
        has_preferred_image=False,
        preferred_rev=0,
    )


def test_apply_png_then_jpeg_bumps_rev(tmp_path):
    store = WebpAssetStore(tmp_path / "artists-preferred")
    artist = _artist()
    apply_preferred_upload(store, artist, _png_bytes())
    assert store.has(artist.id)
    assert artist.has_preferred_image is True
    assert artist.preferred_rev == 1
    apply_preferred_upload(store, artist, _jpeg_bytes())
    assert store.has(artist.id)
    assert artist.preferred_rev == 2
    assert artist.has_image is True
    assert artist.image_source == "local"
    assert artist.mbid == "mbid-1"


def test_oversized_does_not_write(tmp_path):
    store = WebpAssetStore(tmp_path / "artists-preferred")
    artist = _artist()
    with pytest.raises(PreferredImageTooLarge):
        apply_preferred_upload(store, artist, b"x" * (ARTIST_IMAGE_MAX_BYTES + 1))
    assert store.has(artist.id) is False
    assert artist.has_preferred_image is False
    assert artist.preferred_rev == 0


def test_garbage_does_not_write(tmp_path):
    store = WebpAssetStore(tmp_path / "artists-preferred")
    artist = _artist()
    with pytest.raises(PreferredImageUndecodable):
        apply_preferred_upload(store, artist, b"not-an-image")
    assert store.has(artist.id) is False
    assert artist.has_preferred_image is False
    assert artist.preferred_rev == 0


def test_revert_then_noop(tmp_path):
    store = WebpAssetStore(tmp_path / "artists-preferred")
    artist = _artist()
    apply_preferred_upload(store, artist, _png_bytes())
    revert_preferred(store, artist)
    assert store.has(artist.id) is False
    assert artist.has_preferred_image is False
    assert artist.preferred_rev == 2
    assert artist.has_image is True
    assert artist.image_source == "local"
    revert_preferred(store, artist)
    assert artist.preferred_rev == 2
    assert artist.has_preferred_image is False


def test_va_preferred_is_forbidden(tmp_path):
    store = WebpAssetStore(tmp_path / "artists-preferred")
    artist = Artist(
        id=VA_ARTIST_ID,
        name=VA_DISPLAY_NAME,
        name_norm="various artists",
        sort_name="various artists",
        album_count=1,
        track_count=0,
    )
    with pytest.raises(PreferredImageForbidden):
        apply_preferred_upload(store, artist, _png_bytes())
    with pytest.raises(PreferredImageForbidden):
        revert_preferred(store, artist)
