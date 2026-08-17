"""Preferred vs scanned path pick and flag honesty."""

from pathlib import Path

from musicweb.artist_images.resolve import (
    pick_artist_image_path,
    reconcile_artist_image_flags,
)
from musicweb.db.models import Artist


def _artist(**overrides) -> Artist:
    values = dict(
        id="art1",
        name="Artist",
        name_norm="artist",
        sort_name="artist",
        album_count=0,
        track_count=0,
        has_image=True,
        has_preferred_image=True,
        preferred_rev=1,
    )
    values.update(overrides)
    return Artist(**values)


def test_pick_preferred_then_scanned_then_none():
    pref = Path("/tmp/preferred.webp")
    scanned = Path("/tmp/scanned.webp")
    assert pick_artist_image_path(pref, scanned) is pref
    assert pick_artist_image_path(None, scanned) is scanned
    assert pick_artist_image_path(None, None) is None


def test_reconcile_clears_preferred_only():
    artist = _artist()
    reconcile_artist_image_flags(artist, preferred_has=False, scanned_has=True)
    assert artist.has_preferred_image is False
    assert artist.has_image is True


def test_reconcile_clears_scanned_only():
    artist = _artist()
    reconcile_artist_image_flags(artist, preferred_has=True, scanned_has=False)
    assert artist.has_preferred_image is True
    assert artist.has_image is False


def test_reconcile_clears_both():
    artist = _artist()
    reconcile_artist_image_flags(artist, preferred_has=False, scanned_has=False)
    assert artist.has_preferred_image is False
    assert artist.has_image is False


def test_reconcile_never_sets_preferred():
    artist = _artist(has_preferred_image=False, has_image=False)
    reconcile_artist_image_flags(artist, preferred_has=True, scanned_has=True)
    assert artist.has_preferred_image is False
    assert artist.has_image is False
