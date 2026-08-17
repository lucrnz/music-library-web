"""Pure artist-image JSON pickers."""

from musicweb.artist_images.pick import (
    best_lastfm_image,
    fanart_artist_thumb,
    is_lastfm_placeholder,
    mb_image_url_from_lookup,
    pick_musicbrainz_artist,
)
from musicweb.db.names import normalize_name


def test_lastfm_placeholder_rejected_and_mega_wins():
    placeholder = "https://lastfm.freetls.fastly.net/i/u/174s/2a96cbd8b46e442fc41c2b86b821562f.png"
    assert is_lastfm_placeholder(placeholder) is True
    mega = "https://example.com/mega.jpg"
    picked = best_lastfm_image(
        [
            {"#text": placeholder, "size": "extralarge"},
            {"#text": "https://example.com/small.jpg", "size": "small"},
            {"#text": mega, "size": "mega"},
        ]
    )
    assert picked == mega


def test_pick_musicbrainz_exact_name_wins():
    payload = {
        "artists": [
            {"name": "Other", "score": 99, "id": "x"},
            {"name": "Radiohead", "score": 80, "id": "rh"},
        ]
    }
    picked = pick_musicbrainz_artist(payload, normalize_name("Radiohead"))
    assert picked is not None
    assert picked["id"] == "rh"


def test_pick_musicbrainz_score_95_fallback():
    payload = {
        "artists": [
            {"name": "Radio-head", "score": 96, "id": "close"},
        ]
    }
    picked = pick_musicbrainz_artist(payload, normalize_name("Radiohead"))
    assert picked is not None
    assert picked["id"] == "close"


def test_mb_wikimedia_file_rewritten():
    url = mb_image_url_from_lookup(
        {
            "relations": [
                {
                    "type": "image",
                    "url": {
                        "resource": "https://commons.wikimedia.org/wiki/File:Radiohead.jpg"
                    },
                }
            ]
        }
    )
    assert url == (
        "https://commons.wikimedia.org/wiki/Special:FilePath/Radiohead.jpg"
    )


def test_fanart_prefers_thumb():
    url = fanart_artist_thumb(
        {
            "artistthumb": [{"url": "https://cdn.example/thumb.jpg", "likes": "1"}],
            "artistbackground": [{"url": "https://cdn.example/bg.jpg", "likes": "99"}],
        }
    )
    assert url == "https://cdn.example/thumb.jpg"
