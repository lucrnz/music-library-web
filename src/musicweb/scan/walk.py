"""Lossless audio file iteration under the library root."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from pathlib import Path

from musicweb.scan.formats import is_lossless_audio


def iter_lossless_audio(
    root: Path,
    *,
    cancel: Callable[[], bool] | None = None,
) -> Iterator[Path]:
    """Yield lossless audio files under ``root`` (streaming; no full list)."""
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
        if is_lossless_audio(path):
            yield path
