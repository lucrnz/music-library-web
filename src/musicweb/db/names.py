"""Name normalization and stable entity IDs."""

from __future__ import annotations

import re
import uuid
from unicodedata import normalize

# App-specific namespace for UUID v5 entity / track ids.
NAMESPACE = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

UNKNOWN_ARTIST = "Unknown Artist"
UNKNOWN_ALBUM = "Unknown Album"

_WS_RE = re.compile(r"\s+")
_LEADING_ARTICLE_RE = re.compile(r"^(the|a|an)\s+", re.IGNORECASE)


def normalize_name(value: str | None) -> str:
    """NFKC, casefold, collapse whitespace — used for uniqueness keys."""
    if not value:
        return ""
    text = normalize("NFKC", value).casefold().strip()
    return _WS_RE.sub(" ", text)


def display_name(value: str | None, fallback: str) -> str:
    """Strip for display; empty → fallback."""
    if not value:
        return fallback
    text = _WS_RE.sub(" ", value.strip())
    return text if text else fallback


def sort_name(display: str) -> str:
    """Sort key: strip leading English articles."""
    text = display.strip()
    stripped = _LEADING_ARTICLE_RE.sub("", text)
    return normalize_name(stripped) or normalize_name(text)


def artist_id_for(name_norm: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"artist:{name_norm}"))


def album_id_for(artist_id: str, title_norm: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"album:{artist_id}\0{title_norm}"))


def track_id_for(fingerprint_algo: str, fingerprint: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"track:{fingerprint_algo}:{fingerprint}"))


def playlist_id_new() -> str:
    return str(uuid.uuid4())
