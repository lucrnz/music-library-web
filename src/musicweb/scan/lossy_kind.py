"""Album lossy-kind roll-up from present lossy tracks' source codecs."""

from __future__ import annotations


def album_lossy_kind(source_codecs: list[str | None]) -> str | None:
    """Reduce source codecs to ``mp3`` / ``aac`` / ``lossy`` / ``mixed`` / None."""
    kinds: set[str] = set()
    for raw in source_codecs:
        codec = (raw or "").lower()
        if codec in {"mp3", "aac"}:
            kinds.add(codec)
        else:
            kinds.add("lossy")
    if not kinds:
        return None
    if len(kinds) == 1:
        return next(iter(kinds))
    return "mixed"
