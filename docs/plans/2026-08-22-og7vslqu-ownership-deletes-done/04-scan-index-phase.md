# Stage 04: Scan index phase

## Status
done

## Description

Move the index walk-and-batch loop from `LibraryJobRunner` into `scan/index_phase.py`. The runner only dispatches.

## Rationale

`PHASES` / `PhaseCtx` already made the runner an orchestrator. `_phase_index` still owns walk, batch flush, `seen_paths`, and `cover_queue` — scan work in the job module. A `run_index` callable deletes that leak.

## Invariants

- Scan kinds, `BATCH_SIZE` 100, cancel, skip-set, and cover-queue accumulation stay the same.
- `_begin_phase` still writes phase state; scan progress lines still go through the runner’s `_progress`.
- Finalize, covers, artist images, and lyrics stay on the runner as they are.
- A completed scan still writes `last_scan_finished_at`.

## Risks

- None if the move is a straight extract with a progress callback. Do not “clean up” skip/seen semantics in this stage.

## Implementation

### Files

- src/musicweb/scan/index_phase.py
- src/musicweb/jobs/runner.py
- tests/scan/test_index_phase.py

### Steps

1. Create `src/musicweb/scan/index_phase.py` with `run_index(database, library, mode, *, cancel, on_progress=None, batch_size=100)` that contains today’s `_phase_index` loop: `iter_indexable_audio`, batch flush via `process_batch`, `seen_paths` / `cover_queue`, `on_progress` with the same fields `_progress` currently gets for phase `index` (`files_seen`, `files_upserted`, `current_path`). Return a small result (`seen_count`, `upserted`, `seen_paths`, `cover_queue`).
2. In `src/musicweb/jobs/runner.py`, `_do_index` calls `run_index` and writes the result onto `PhaseCtx`. Delete `_phase_index`. Drop `iter_indexable_audio` and `process_batch` imports. Keep `BATCH_SIZE` only if the runner still needs it — otherwise it lives as `run_index`’s default.
3. Add `tests/scan/test_index_phase.py` that runs `run_index` against the existing tmp-library fixture (or a tiny tree) and asserts seen/upserted/cover_queue / cancel-stop. Do not re-test `process_batch` skip rules here.

### Verify

- `uv run --group dev pytest tests/scan/test_index_phase.py tests/scan/test_batch.py tests/jobs/test_runner.py tests/scan/test_walk.py`
- `rg "iter_indexable_audio|process_batch" src/musicweb/jobs/runner.py` is empty

## Acceptance

- `src/musicweb/jobs/runner.py` does not import `iter_indexable_audio` or `process_batch`.
- `_do_index` calls `run_index` and does not walk files itself.
- `src/musicweb/scan/index_phase.py` exists and is the only walk+batch flush for jobs.
- The pytest commands in Verify pass.
