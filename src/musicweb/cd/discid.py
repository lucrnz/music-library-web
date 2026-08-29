"""MusicBrainz disc-id from a Red Book TOC (no libdiscid)."""

from __future__ import annotations

import base64
import hashlib
from collections.abc import Sequence


def disc_id(
    first_track: int,
    last_audio_track: int,
    leadout_lba: int,
    offsets: Sequence[int],
) -> str:
    """SHA-1 of packed first/last/leadout/offsets, RFC 822 base64 with ``._-``.

    *offsets* and *leadout_lba* are libcdio LSNs (LBA 0 = MSF 00:02:00).
    The MusicBrainz hash adds the 150-frame lead-in to each used address.
    Unused track slots (1–99) hash as zero, not +150.
    """
    if last_audio_track < first_track:
        raise ValueError("last_audio_track before first_track")
    expected = last_audio_track - first_track + 1
    if len(offsets) != expected:
        raise ValueError("offsets length must match audio track count")
    by_no = {first_track + i: int(off) for i, off in enumerate(offsets)}
    packed = f"{first_track:02X}{last_audio_track:02X}{int(leadout_lba) + 150:08X}"
    for track in range(1, 100):
        if track in by_no:
            packed += f"{by_no[track] + 150:08X}"
        else:
            packed += "00000000"
    digest = hashlib.sha1(packed.encode("ascii")).digest()
    return (
        base64.b64encode(digest)
        .decode("ascii")
        .replace("+", ".")
        .replace("/", "_")
        .replace("=", "-")
    )
