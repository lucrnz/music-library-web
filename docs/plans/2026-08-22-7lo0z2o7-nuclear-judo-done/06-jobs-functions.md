# Stage 06: Jobs functions

## Status
done

## Description

Delete `LibraryJobRunner.PHASES` and `getattr(self, f"_do_{name}")`. `run_scan` / `regen_covers` / `regen_artist_images` / `regen_lyrics` live in `scan/jobs.py`. The runner stays single-flight / thread / cancel / `ScanState`.

## Rationale

The last extract moved the walk out of the runner but left a mini-framework. Kind-to-function dispatch deletes that layer without changing scan or regen results.

## Invariants

- One job at a time; `start` returns False when busy; `run_sync` raises if busy.
- Scan still runs index → finalize → covers → artist_images → lyrics, with cancel checks between phases.
- Regen kinds still run only their enrichment. `force` / full-scan meaning unchanged (`scan` force is `mode == "full"`).
- Completed scan still writes `last_scan_finished_at`.
- Progress log lines stay greppable (`Library scan:` / `Library {kind}:`).

## Risks

- Moving finalize into `run_scan` can drop the `files_missing` ScanState write if the callback is omitted. `run_scan` must still report missing/upserted/seen through the progress callback the runner already uses.
- Control/CLI go through the runner; do not add a second SQL path.

## Implementation

### Files

- src/musicweb/scan/jobs.py
- src/musicweb/jobs/runner.py
- tests/jobs/test_runner.py
- tests/scan/test_index_phase.py

### Steps

1. Add `src/musicweb/scan/jobs.py` with `run_scan`, `regen_covers`, `regen_artist_images`, and `regen_lyrics`. Bodies are the current `_do_index` + `_phase_finalize` + `_do_covers` / `_do_artist_images` / `_do_lyrics` sequence (scan) or the single regen body. Accept `database`, `library`, stores/fetchers, `cancel`, `force`, `mode` where needed, and `on_progress`.
2. `run_scan` calls `run_index` then finalize (`mark_missing`, `recount_entities`, optional `fts_rebuild`) then the three enrichment functions. Honor `cancel` between phases the same way `_run_phases` does.
3. `LibraryJobRunner._execute` maps `kind` to one of those four functions. Delete `PHASES`, `_run_phases`, `_do_index`, `_do_finalize`, `_do_covers`, `_do_artist_images`, `_do_lyrics`, and `_phase_finalize`. Keep `_begin`, `_set_state`, `_progress`, `_thread_main`, `start`, `run_sync`, `request_cancel`, `shutdown`, `status`.
4. After a successful `run_scan`, the runner still sets `last_scan_finished_at` as today.
5. Keep `tests/jobs/test_runner.py` single-flight tests (they mock `_execute`). Add or adjust a test that a known `kind` calls the matching `scan.jobs` function (monkeypatch `run_scan` / `regen_*`). `test_index_phase.py` stays the walk/batch unit.

### Verify

- `uv run pytest tests/jobs/test_runner.py tests/scan/test_index_phase.py tests/scan/test_finalize.py tests/scan/test_batch.py`

## Acceptance

- `rg -n "PHASES|_run_phases|_do_index|_do_finalize|getattr\\(self, f\\\"_do_" src/musicweb/jobs/runner.py` is empty.
- `rg -n "def run_scan|def regen_covers|def regen_artist_images|def regen_lyrics" src/musicweb/scan/jobs.py` hits all four.
- Runner tests still prove single-flight and cancel. Index-phase tests still pass.
- `LibraryJobRunner` still exposes `start`, `run_sync`, `request_cancel`, `status`.
