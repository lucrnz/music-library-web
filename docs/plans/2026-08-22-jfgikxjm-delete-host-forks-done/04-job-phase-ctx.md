# Stage 04: Job PhaseCtx

## Status
done

## Description

Replace the untyped job `ctx` bag with a `PhaseCtx` dataclass. One `_begin_phase` owns `set_state(phase)` and scan `_progress`.

## Rationale

`PHASES` landed; the three enrichment `_do_*` methods still copy the begin sandwich and hide behind `# type: ignore`. Completes the last plan as written.

## Invariants

- `PHASES` stays on `LibraryJobRunner`. Scan is still index → finalize → covers → artist_images → lyrics. Each regen kind is still its one phase.
- Control UDS RPC method names do not change.
- Cancel still returns between phases. Cover regen still rebuilds `cover_queue` via `album_cover_sources` when kind is not `scan`.
- Greppable `Library scan:` / `Library {kind}:` progress lines stay.

## Risks

- `_phase_index` still mutates counts used by later phases — `PhaseCtx` fields must be the same objects (especially `seen_paths` and `cover_queue`), not copies.

## Implementation

### Files

- `src/musicweb/jobs/runner.py`
- `tests/jobs/test_runner.py`

### Steps

1. In `src/musicweb/jobs/runner.py`, add a `PhaseCtx` dataclass (`kind`, `mode`, `force`, `seen_count`, `upserted`, `missing`, `seen_paths`, `cover_queue`) and construct it in `_run_phases` instead of `dict[str, object]`.
2. Add `_begin_phase(ctx, name)` that `_set_state(phase=name, force=ctx.force)` and, when `ctx.kind == "scan"`, calls `_progress` with the ctx counts. `_run_phases` calls it before each `_do_*`.
3. Strip the copied `set_state` + `if kind == "scan": _progress` blocks from `_do_covers` / `_do_artist_images` / `_do_lyrics`. Delete every `# type: ignore[arg-type]` and `assert isinstance` that existed only for the bag. `_do_*` keep the work (index flush, finalize, extract_covers, fetchers).
4. In `tests/jobs/test_runner.py`, assert `PHASES` keys match `_do_*` method names and that each listed phase exists.

### Verify

- `uv run pytest tests/jobs/test_runner.py tests/scan/test_finalize.py tests/scan/test_batch.py`
- `rg -n "type: ignore" src/musicweb/jobs/runner.py` is empty
- `rg -n "dict\\[str, object\\]" src/musicweb/jobs/runner.py` is empty

## Acceptance

- Job context is `PhaseCtx`. No `type: ignore` in `runner.py`.
- One `_begin_phase`. `_do_covers` / `_do_artist_images` / `_do_lyrics` do not set phase or log scan progress themselves.
- `PHASES` table and control RPC names are unchanged.
