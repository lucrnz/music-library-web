"""Well-known MusicBrainz disc id from a libcdio TOC."""

from musicweb.cd.discid import disc_id

# MusicBrainz full TOC (already +150): 1 15 258725 150 17510 ... 235590
# https://musicbrainz.org/cdtoc/TqvKjMu7dMliSfmVEBtrL7sBSno-
_MB_OFFSETS = [
    150,
    17510,
    33275,
    45910,
    57805,
    78310,
    94650,
    109580,
    132010,
    149160,
    165115,
    177710,
    203325,
    215555,
    235590,
]
KNOWN_ID = "TqvKjMu7dMliSfmVEBtrL7sBSno-"


def test_known_toc_discid():
    offsets = [n - 150 for n in _MB_OFFSETS]
    assert (
        disc_id(1, 15, 258725 - 150, offsets) == KNOWN_ID
    )
