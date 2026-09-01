"""Various Artists (VA) alias matching and well-known artist id."""

from __future__ import annotations

import re
from unicodedata import category, name, normalize

from musicweb.db.names import artist_id_for, display_name, normalize_name

VA_DISPLAY_NAME = "Various Artists"
VA_ARTIST_ID = artist_id_for(normalize_name(VA_DISPLAY_NAME))

_WS_RE = re.compile(r"\s+")

# Closed set of already-folded keys. See plan context/va-aliases.md.
_VA_KEYS: frozenset[str] = frozenset(
    {
        "va",
        "v a",
        "various",
        "various artist",
        "various artists",
        "various artistes",
        "varios",
        "varios artistas",
        "artiste varies",
        "artistes varies",
        "artiste divers",
        "artistes divers",
        "verschiedene",
        "verschiedene interpreten",
        "verschiedene kunstler",
        "multiple artist",
        "multiple artists",
        "assorted artist",
        "assorted artists",
        "omnibus",
        "オムニバス",
        "オムニバスアルバム",
        "ヴァリアス",
        "ヴァリアス アーティスト",
        "ヴァリアスアーティスト",
        "ヴァリアス アーティスツ",
        "ヴァリアスアーティスツ",
        "artisti vari",
        "artisti varii",
        "diverse artiesten",
        "verschillende artiesten",
        "blandade artister",
        "eri esittajia",
        "forskjellige artister",
        "forskellige kunstnere",
        "artistas varios",
        "varios interpretes",
        "群星",
        "合輯",
        "合集",
        "разные исполнители",
    }
)


def _is_punct(char: str) -> bool:
    if category(char).startswith("P"):
        return True
    return char in {"・", "·", "‧"}


def _apply_punct(text: str, *, replace_with: str) -> str:
    return "".join(replace_with if _is_punct(ch) else ch for ch in text)


def _is_latin(char: str) -> bool:
    return "LATIN" in name(char, "")


def _strip_latin_marks(text: str) -> str:
    """Fold é→e / ü→u without decomposing Japanese dakuten."""
    out: list[str] = []
    for char in text:
        decomp = normalize("NFKD", char)
        if _is_latin(decomp[0]):
            out.append("".join(ch for ch in decomp if category(ch) != "Mn"))
        else:
            out.append(char)
    return "".join(out)


def _finish_fold(text: str) -> str:
    collapsed = _WS_RE.sub(" ", text).strip()
    return _WS_RE.sub(" ", _strip_latin_marks(collapsed)).strip()


def fold_va_keys(value: str | None) -> frozenset[str]:
    """Two folded forms: punctuation deleted, and punctuation replaced by space."""
    if not value:
        return frozenset()
    base = normalize("NFKC", value).casefold()
    deleted = _finish_fold(_apply_punct(base, replace_with=""))
    spaced = _finish_fold(_apply_punct(base, replace_with=" "))
    return frozenset(k for k in (deleted, spaced) if k)


def is_va_name(value: str | None) -> bool:
    """True when the whole field folds to a listed VA alias."""
    keys = fold_va_keys(value)
    return bool(keys & _VA_KEYS)


def canonical_artist_display(value: str | None, fallback: str) -> str:
    """``Various Artists`` when *value* is a VA alias; else ``display_name``."""
    if is_va_name(value):
        return VA_DISPLAY_NAME
    return display_name(value, fallback)
