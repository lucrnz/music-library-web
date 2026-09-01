"""Write and revert operator-preferred artist portraits (FastAPI-free)."""

from __future__ import annotations

from musicweb.config import ARTIST_IMAGE_MAX_BYTES
from musicweb.db.models import Artist
from musicweb.db.va import VA_ARTIST_ID
from musicweb.images import WebpAssetStore


class PreferredImageTooLarge(Exception):
    """Source bytes exceed ARTIST_IMAGE_MAX_BYTES."""


class PreferredImageUndecodable(Exception):
    """Empty or undecodable image bytes."""


class PreferredImageForbidden(Exception):
    """Preferred portraits are not allowed for this artist."""


def apply_preferred_upload(
    store: WebpAssetStore, artist: Artist, data: bytes
) -> Artist:
    if artist.id == VA_ARTIST_ID:
        raise PreferredImageForbidden("VA has no preferred portrait")
    if len(data) > ARTIST_IMAGE_MAX_BYTES:
        raise PreferredImageTooLarge("Image too large")
    if not data or not store.write_from_bytes(artist.id, data):
        raise PreferredImageUndecodable("Could not decode image")
    artist.has_preferred_image = True
    artist.preferred_rev = int(artist.preferred_rev or 0) + 1
    return artist


def revert_preferred(store: WebpAssetStore, artist: Artist) -> Artist:
    if artist.id == VA_ARTIST_ID:
        raise PreferredImageForbidden("VA has no preferred portrait")
    if not artist.has_preferred_image and not store.has(artist.id):
        return artist
    store.delete(artist.id)
    artist.has_preferred_image = False
    artist.preferred_rev = int(artist.preferred_rev or 0) + 1
    return artist
