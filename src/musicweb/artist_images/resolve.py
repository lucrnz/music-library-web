"""Preferred vs scanned artist-image path pick and flag honesty."""

from __future__ import annotations

from pathlib import Path

from musicweb.db.models import Artist


def pick_artist_image_path(
    preferred: Path | None, scanned: Path | None
) -> Path | None:
    if preferred is not None:
        return preferred
    return scanned


def reconcile_artist_image_flags(
    artist: Artist, preferred_has: bool, scanned_has: bool
) -> None:
    if artist.has_preferred_image and not preferred_has:
        artist.has_preferred_image = False
    if artist.has_image and not scanned_has:
        artist.has_image = False
