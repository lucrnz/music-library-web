"""Walk + batch-flush index phase. Job runner only dispatches."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from musicweb.db.engine import Database
from musicweb.library import Library
from musicweb.scan.batch import ScanMode, process_batch
from musicweb.scan.walk import iter_indexable_audio

DEFAULT_BATCH_SIZE = 100

ProgressFn = Callable[..., None]


@dataclass
class IndexPhaseResult:
    seen_count: int
    upserted: int
    seen_paths: set[str] = field(default_factory=set)
    cover_queue: dict[str, Path] = field(default_factory=dict)


def run_index(
    database: Database,
    library: Library,
    mode: ScanMode,
    *,
    cancel: Callable[[], bool],
    on_progress: ProgressFn | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> IndexPhaseResult:
    """Walk indexable audio and flush batches. Does not finalize or enrich."""
    seen_paths: set[str] = set()
    seen_count = 0
    upserted = 0
    cover_queue: dict[str, Path] = {}
    batch: list[Path] = []

    def flush(batch_paths: list[Path], *, clear_path: bool = False) -> None:
        nonlocal seen_count, upserted, batch
        if not batch_paths:
            return
        s, u, covers, skipped = process_batch(
            database,
            library,
            batch_paths,
            mode,
            cancel=cancel,
        )
        seen_count += s
        upserted += u
        cover_queue.update(covers)
        for p in batch_paths:
            rel = library.relative_to_root(p)
            if rel not in skipped:
                seen_paths.add(rel)
        last_rel = (
            None if clear_path else library.relative_to_root(batch_paths[-1])
        )
        if on_progress is not None:
            on_progress(
                files_seen=seen_count,
                files_upserted=upserted,
                current_path=last_rel,
            )
        batch = []

    for path in iter_indexable_audio(
        library.root,
        index_lossy=library.index_lossy,
        cancel=cancel,
    ):
        if cancel():
            break
        batch.append(path)
        if len(batch) >= batch_size:
            flush(batch)

    if batch and not cancel():
        flush(batch, clear_path=True)

    return IndexPhaseResult(
        seen_count=seen_count,
        upserted=upserted,
        seen_paths=seen_paths,
        cover_queue=cover_queue,
    )
