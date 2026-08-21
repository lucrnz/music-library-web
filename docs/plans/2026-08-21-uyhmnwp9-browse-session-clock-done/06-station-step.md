# Stage 06: One station clock step

## Status
done

## Description

Collapse `_run_catchup` and `_tick` onto one `_step(session, now) -> dirty`. Catch-up is `while` still behind; tick is one step. One `_with_session` helper for catch-up / tick / persist-shutdown.

## Rationale

The next station rule (skip, exclusive radio, whatever) will be written twice if catch-up and tick stay twins. 534 lines, and the clock is the part that grows.

## Invariants

- Catch-up still suppresses advance logs (`_log_advances = False`) and still logs how many tracks it skipped over.
- Tick still takes one step per call.
- Faces, persist-on-dirty, skip/probe/path reasons, and picker/banlist behavior unchanged.
- `scan_finished_at` / catalog refresh stay as stage 05 left them. Do not invent a second Track DTO here.

## Risks

- Catch-up’s `reason == "path"` **break** (do not skip) vs tick’s skip-on-path must survive the extract. If `_step` always skips path, catch-up will eat a missing file the current clock waits on.

## Implementation

### Files

- `src/musicweb/radio/station.py`
- `tests/radio/test_catchup.py`
- `tests/radio/test_station.py`

### Steps

1. Add `_with_session(fn)` that opens a session, runs `fn(session)`, commits if dirty (or always-persist for shutdown), rolls back otherwise, closes. `run_catchup`, `tick`, and `persist_shutdown` use it. Delete the four copied try/except/finally blocks.
2. Extract `_step(session, now) -> bool` (dirty) from `_tick`: no current → `_try_start`; missing duration → skip `missing`; block `path` / `probe` / `skip` → skip (tick today); no start time → set now; ended → `_advance`.
3. `_tick` is `_step` once (after `_load` if needed). `_run_catchup` loads, disables advance logs, and loops `_step` **except** `path` still `break`s without skip (keep today’s catch-up `reason == "path": break`). Count advances for the existing log line. Restore `_log_advances` and `_log_current` in `finally`.
4. Do not change `_stash_snapshot`, `_snapshot_track`, or serialize.
5. Existing catch-up / tick tests must keep passing. Add one test that catch-up stops on a path-unresolvable current (does not drain the queue) and one that tick skips that same current.

### Verify

- `rg -n "def _tick|def _run_catchup|def _step" src/musicweb/radio/station.py` shows `_step` as the clock body; `_tick` / `_run_catchup` are thin.
- `uv run pytest tests/radio/test_catchup.py tests/radio/test_station.py`

## Acceptance

- One `_step` owns start / skip / advance.
- Catch-up still does not skip a `path` block; tick still does.
- Session open/commit/rollback exists once.
- `RadioStation` line count shrinks. No new Track DTO.
