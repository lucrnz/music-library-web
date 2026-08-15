"""Same-folder lossless sibling matching for lossy scan skip."""

from __future__ import annotations

from pathlib import Path

from musicweb.metadata import TrackMetadata, read_metadata
from musicweb.scan.formats import is_lossless_audio

Slot = tuple[str, int | str, int] | tuple[str, str]


def slot_key(disc: int | None, track: int | None, stem: str) -> Slot:
    """Match key: (disc or 1, track) when track is set; else casefolded stem."""
    if track is not None:
        return ("num", 1 if disc is None else int(disc), int(track))
    return ("stem", stem.casefold())


def lossless_slots_in_dir(directory: Path) -> dict[Slot, Path]:
    """Map slot → lossless file in ``directory`` (one winner per slot)."""
    slots: dict[Slot, Path] = {}
    try:
        entries = list(directory.iterdir())
    except OSError:
        return slots
    for entry in entries:
        if entry.name.startswith("."):
            continue
        try:
            if not is_lossless_audio(entry):
                continue
        except OSError:
            continue
        meta = read_metadata(entry)
        key = slot_key(meta.disc, meta.track, entry.stem)
        slots[key] = entry
    return slots


def should_skip_lossy(
    path: Path,
    meta: TrackMetadata,
    slots: dict[Slot, Path],
) -> bool:
    """True when ``path`` shares a slot with a lossless file in the same folder."""
    key = slot_key(meta.disc, meta.track, path.stem)
    hit = slots.get(key)
    if hit is None:
        return False
    try:
        return hit.resolve() != path.resolve()
    except OSError:
        return hit != path
