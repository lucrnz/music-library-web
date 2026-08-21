"""Reserved ``source`` stream tag: serve the original file, never encode."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from musicweb.transcode.profiles import get_profile

SOURCE_TAG = "source"

StreamIntentKind = Literal["passthrough", "encode", "reject"]


@dataclass(frozen=True)
class StreamIntent:
    """Product decision for one (is_lossy, codec) pair."""

    kind: StreamIntentKind
    detail: str = ""
    status: int = 409


def stream_intent(*, is_lossy: bool, codec: str) -> StreamIntent:
    """Decide passthrough vs encode vs reject (409 conflict / 400 unknown tag)."""
    if codec == SOURCE_TAG:
        if is_lossy:
            return StreamIntent(kind="passthrough")
        return StreamIntent(
            kind="reject",
            detail=(
                "Lossless tracks cannot be requested as source; pick a stream profile"
            ),
            status=409,
        )
    try:
        get_profile(codec)
    except ValueError as exc:
        return StreamIntent(kind="reject", detail=str(exc), status=400)
    if is_lossy:
        return StreamIntent(
            kind="reject",
            detail="This track is a lossy source and must be requested as source",
            status=409,
        )
    return StreamIntent(kind="encode")


def can_encode(*, is_lossy: bool) -> bool:
    """True when a track can have encode-cache files (lossy originals never do)."""
    return not is_lossy


def passthrough_media(source_codec: str | None) -> tuple[str, str]:
    """Return ``(media_type, filename_extension)`` for a lossy original."""
    kind = (source_codec or "").lower()
    if kind == "mp3":
        return "audio/mpeg", "mp3"
    if kind == "aac":
        return "audio/mp4", "m4a"
    raise ValueError("lossy source_codec must be mp3 or aac")
