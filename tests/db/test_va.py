"""VA alias matcher."""

import pytest

from musicweb.db.names import artist_id_for, normalize_name
from musicweb.db.va import (
    VA_ARTIST_ID,
    VA_DISPLAY_NAME,
    canonical_artist_display,
    is_va_name,
)

TRUE_CASES = [
    "VA",
    "V.A.",
    "V/A",
    "V.A",
    "V. A.",
    "va",
    "v a",
    "Various",
    "Various Artist",
    "Various Artists",
    "Various Artistes",
    "Artistes Variés",
    "Artistes Varies",
    "Varios",
    "Vários",
    "Varios Artistas",
    "Vários Artistas",
    "Artiste Varies",
    "Artistes Varies",
    "Artiste Divers",
    "Artistes Divers",
    "Verschiedene",
    "Verschiedene Interpreten",
    "Verschiedene Künstler",
    "Multiple Artist",
    "Multiple Artists",
    "Assorted Artist",
    "Assorted Artists",
    "Omnibus",
    "オムニバス",
    "オムニバスアルバム",
    "ヴァリアス",
    "ヴァリアス・アーティスト",
    "ヴァリアスアーティスト",
    "ヴァリアス・アーティスツ",
    "Artisti Vari",
    "Artisti Varii",
    "Diverse Artiesten",
    "Verschillende Artiesten",
    "Blandade Artister",
    "Eri Esittäjiä",
    "Forskjellige Artister",
    "Forskellige Kunstnere",
    "Artistas Varios",
    "Varios Intérpretes",
    "群星",
    "合輯",
    "合集",
    "Разные исполнители",
    "Various Artist's",
]

FALSE_CASES = [
    "Various Production",
    "Unknown Artist",
    "Soundtrack",
    "OST",
    "Original Soundtrack",
    "Compilation",
    "Compilations",
    "Now That's What I Call Music — Various Artists",
    "",
    None,
    "  ",
]


@pytest.mark.parametrize("name", TRUE_CASES)
def test_is_va_name_true(name: str) -> None:
    assert is_va_name(name) is True


@pytest.mark.parametrize("name", FALSE_CASES)
def test_is_va_name_false(name: str | None) -> None:
    assert is_va_name(name) is False


def test_va_artist_id_is_stable() -> None:
    assert VA_ARTIST_ID == artist_id_for(normalize_name("Various Artists"))
    assert VA_ARTIST_ID == artist_id_for(normalize_name(VA_DISPLAY_NAME))


def test_canonical_display_rewrites_alias() -> None:
    assert canonical_artist_display("V.A.", "x") == VA_DISPLAY_NAME
    assert canonical_artist_display("Radiohead", "x") == "Radiohead"
    assert canonical_artist_display(None, "x") == "x"
