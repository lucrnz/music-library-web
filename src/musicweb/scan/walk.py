"""Indexable audio file iteration under the library root."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from pathlib import Path

from musicweb.scan.formats import is_indexable_audio


def iter_indexable_audio(
    root: Path,
    *,
    index_lossy: bool = False,
    cancel: Callable[[], bool] | None = None,
) -> Iterator[Path]:
    """Yield indexable audio files under ``root`` (streaming; no full list)."""
    for path in root.rglob("*"):
        if cancel and cancel():
            return
        if path.name.startswith("."):
            continue
        try:
            if not path.is_file():
                continue
        except OSError:
            continue
        if is_indexable_audio(path, index_lossy=index_lossy):
            yield path
