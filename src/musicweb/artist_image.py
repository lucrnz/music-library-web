"""Artist profile image WebP store under the data directory.

Images live at ``$MUSICWEB_DATA_DIR/covers/artists/{artist_id}.{full|thumb}.webp``.
Placeholders are never written to disk and never set ``has_image``.
"""

from __future__ import annotations

from pathlib import Path

from musicweb.images import WebpAssetStore, placeholder_webp

__all__ = ["ArtistImageStore", "placeholder_webp"]


class ArtistImageStore:
    """Persisted artist-keyed WebP portraits under the data directory."""

    def __init__(self, data_dir: Path) -> None:
        self._store = WebpAssetStore(data_dir / "covers" / "artists")
        self.root = self._store.root

    def path_for(self, artist_id: str, size: str) -> Path:
        return self._store.path_for(artist_id, size)

    def has_image(self, artist_id: str) -> bool:
        return self._store.has(artist_id)

    def image_path(self, artist_id: str, size: str) -> Path | None:
        return self._store.get_path(artist_id, size)

    def ensure_from_bytes(self, artist_id: str, source: bytes) -> bool:
        """Write full+thumb WebP from raw image bytes. Returns True on success."""
        return self._store.write_from_bytes(artist_id, source)

    def delete(self, artist_id: str) -> None:
        self._store.delete(artist_id)
