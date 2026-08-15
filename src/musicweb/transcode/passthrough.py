"""Reserved ``source`` stream tag: serve the original file, never encode."""

from __future__ import annotations

from typing import Literal

from musicweb.transcode.profiles import get_profile

SOURCE_TAG = "source"

StreamPlan = Literal["passthrough", "encode"]


class StreamConflict(Exception):
    """Track kind and codec tag cannot be combined (HTTP 409)."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def plan_stream(*, is_lossy: bool, codec: str) -> StreamPlan:
    """Decide passthrough vs encode, or raise ``StreamConflict`` / ``ValueError``."""
    if codec == SOURCE_TAG:
        if is_lossy:
            return "passthrough"
        raise StreamConflict(
            "Lossless tracks cannot be requested as source; pick a stream profile"
        )
    get_profile(codec)
    if is_lossy:
        raise StreamConflict(
            "This track is a lossy source and must be requested as source"
        )
    return "encode"


def passthrough_media(source_codec: str | None) -> tuple[str, str]:
    """Return ``(media_type, filename_extension)`` for a lossy original."""
    kind = (source_codec or "").lower()
    if kind == "mp3":
        return "audio/mpeg", "mp3"
    return "audio/mp4", "m4a"
