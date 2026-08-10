"""Pure JSON → URL / entity pickers for artist image providers."""

from __future__ import annotations

import urllib.parse

from musicweb.db.names import normalize_name

# Last.fm placeholder / star assets (third-party keys often return these).
_LASTFM_PLACEHOLDER_MARKERS = (
    "2a96cbd8b46e442fc41c2b86b821562f",
    "default_avatar",
    "/serve/64s/2a96cbd8",
    "lastfm.freetls.fastly.net/i/u/64s/",
    "lastfm.freetls.fastly.net/i/u/174s/2a96cbd8",
)


def is_lastfm_placeholder(url: str) -> bool:
    lower = url.lower()
    return any(m in lower for m in _LASTFM_PLACEHOLDER_MARKERS)


def best_lastfm_image(images: list) -> str | None:
    size_rank = {"mega": 5, "extralarge": 4, "large": 3, "medium": 2, "small": 1, "": 0}
    ranked: list[tuple[int, str]] = []
    for item in images or []:
        if not isinstance(item, dict):
            continue
        url = (item.get("#text") or item.get("text") or "").strip()
        if not url or not url.startswith("http"):
            continue
        if is_lastfm_placeholder(url):
            continue
        size = (item.get("size") or "").lower()
        ranked.append((size_rank.get(size, 0), url))
    if not ranked:
        return None
    ranked.sort(key=lambda x: x[0], reverse=True)
    return ranked[0][1]


def pick_musicbrainz_artist(payload: dict, name_norm: str) -> dict | None:
    artists = payload.get("artists") if isinstance(payload, dict) else None
    if not isinstance(artists, list) or not artists:
        return None

    exact: list[dict] = []
    for a in artists:
        if not isinstance(a, dict):
            continue
        score = int(a.get("score") or 0)
        a_norm = normalize_name(a.get("name") or "")
        if a_norm == name_norm and score >= 90:
            exact.append(a)
        elif a_norm == name_norm:
            exact.append(a)

    if exact:
        exact.sort(key=lambda a: int(a.get("score") or 0), reverse=True)
        return exact[0]

    best = max(
        (a for a in artists if isinstance(a, dict)),
        key=lambda a: int(a.get("score") or 0),
        default=None,
    )
    if best is not None and int(best.get("score") or 0) >= 95:
        return best
    return None


def mb_image_url_from_lookup(payload: dict) -> str | None:
    """Extract a direct image URL from artist relations if present."""
    relations = payload.get("relations") if isinstance(payload, dict) else None
    if not isinstance(relations, list):
        return None
    for rel in relations:
        if not isinstance(rel, dict):
            continue
        if (rel.get("type") or "").lower() != "image":
            continue
        url_obj = rel.get("url")
        href = None
        if isinstance(url_obj, dict):
            href = url_obj.get("resource")
        elif isinstance(url_obj, str):
            href = url_obj
        if not href or not href.startswith("http"):
            continue
        if "commons.wikimedia.org/wiki/File:" in href:
            file_name = href.rsplit("File:", 1)[-1]
            file_name = urllib.parse.unquote(file_name)
            return (
                "https://commons.wikimedia.org/wiki/Special:FilePath/"
                + urllib.parse.quote(file_name)
            )
        if any(
            href.lower().endswith(ext)
            for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif")
        ):
            return href
        if "upload.wikimedia.org" in href:
            return href
    return None


def fanart_artist_thumb(payload: dict) -> str | None:
    """Prefer portrait thumbs; fall back to background or logo."""

    def best_url(items: object) -> str | None:
        if not isinstance(items, list):
            return None
        ranked = [i for i in items if isinstance(i, dict) and i.get("url")]
        if not ranked:
            return None

        def likes(item: dict) -> int:
            try:
                return int(item.get("likes") or 0)
            except (TypeError, ValueError):
                return 0

        ranked.sort(key=likes, reverse=True)
        url = str(ranked[0].get("url") or "")
        return url if url.startswith("http") else None

    for key in ("artistthumb", "artistbackground", "hdmusiclogo", "musiclogo"):
        url = best_url(payload.get(key))
        if url:
            return url
    return None
