# Stage 03: Library job runner (multi-kind)

## Status
done

## Description

Introduce `musicweb.jobs` as the **only** orchestration layer for library work: single-flight `start` / `run_sync` / `status` / `request_cancel`, with a job `kind`. Move scan orchestration out of a scan-only mental model into this runner. `scan/` keeps walk, fingerprint, batch, phases, finalize — **not** the HTTP/CLI job façade. Full scan passes `force=(mode == "full")` into covers, artist images, and lyrics (artist force body completed in stage 06).

## Rationale

Typer, HTTP, and UDS must not each call enrichment phases differently. One runner fixes dual orchestration and keeps job status truthful for every kind. `jobs/` is not a pass-through: it owns thread lifecycle, cancel, and `ScanState` updates.

## Implementation

1. **Package `src/musicweb/jobs/`**
   - e.g. `runner.py` with `LibraryJobRunner` (name flexible).
   - Owns: `_running` lock, cancel event, worker thread for async `start`, same-thread `run_sync`, `status()`, `request_cancel()`, `shutdown()`.
   - **Does not** reimplement walk/fingerprint/cover extract logic — dispatches into `scan.*`.
2. **Extract from today’s `LibraryScanner`**
   - Pipeline body that is currently `_run` / `_scan` becomes what the runner invokes for `kind=scan` (move or thin-wrap; delete duplicate orchestration).
   - Prefer: scanner module becomes phase/pipeline helpers, **or** runner holds the old class privately — end state: **external callers (routes, CLI, control) only use `LibraryJobRunner`**, not a second public start API.
3. **API shape**
   - `start(kind, **opts) -> bool` — if idle, spawn thread; return False if busy.
   - `run_sync(kind, **opts) -> None` (or result status) — if idle, run on **caller thread**; `KeyboardInterrupt` → set cancel, cooperative finish; **not** start+join.
   - Kinds in this stage: at least `scan` with `mode: quick|full`.
   - Regen kinds registered as no-ops or omitted until stages 06–07 wire them — but the **dispatch table / kind type** exists so regen does not invent a second entrypoint style.
4. **Force on full scan**
   - For `kind=scan` and `mode=full`: `force=True` into cover extract, artist-image fetch, lyrics fetch (artist overwrite behavior completed in stage 06; parameter must exist).
5. **Status / ScanState**
   - One row (`scan_state` or renamed conceptually). Additive fields as needed: `kind` (default `scan`), keep `mode`; optional `force` flag if useful.
   - **Scan-only counters** (`files_seen`, etc.): meaningful for `kind=scan`; for other kinds leave 0 / unused — do not overload meanings.
   - Migration for `kind` (and any new columns) in this stage if Phase 1 will write them; otherwise ship minimal status compatibility and complete migration when first non-scan kind runs (prefer **this stage** so status shape is stable).
6. Wire `app.state` / bootstrap to expose the runner; update HTTP library-scan routes to call the runner (thin adapters) so there is one public start path before CLI exists.
7. No Typer commands in this stage.
