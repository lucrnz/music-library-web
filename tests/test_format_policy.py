"""Note: formatPolicy is JS pure logic; this file documents server-side matrix
alignment used by exclusive-formats. Client policy is in static/js/exclusive/formatPolicy.js.
"""

from musicweb.transcode.profiles import exclusive_formats_payload, flac_tag


def test_exclusive_formats_include_source_preferred_cells():
    tags = {f["tag"] for f in exclusive_formats_payload()["formats"]}
    assert flac_tag(16, 44100) in tags
    assert flac_tag(24, 96000) in tags
    assert flac_tag(24, 192000) in tags
