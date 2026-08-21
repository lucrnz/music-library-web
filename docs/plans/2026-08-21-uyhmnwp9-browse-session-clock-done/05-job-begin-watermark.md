# Stage 05: One job begin and last_scan_finished_at

## Status
done

## Description

One `_begin` writes the running `ScanState` row for HTTP and CLI. `_execute` does not rewrite it. `_progress` logs only. Add `scan_state.last_scan_finished_at` (Alembic 012), set only when a scan job reaches idle. Radio reads that column.

## Rationale

`start()` and `_execute()` both persist the same running row. Radio then treats the multiplexed `kind` as an index watermark, so a regen makes `scan_finished_at()` return `None`. This stage deletes the double write and gives radio a real scan timestamp.

## Invariants

- Single-flight runner unchanged. `start` still returns False when busy; `run_sync` still raises.
- Regen kinds still share the same row (`kind`, `force`, `finished_at` for the job that just ran).
- Radio still rebuilds the catalog only when the watermark string changes. It does not interpret `kind`.
- No `PHASES` table.

## Risks

- `test_empty_then_scan_watermark_picks` sets `kind` + `finished_at` only. After this stage it must set `last_scan_finished_at` or radio will stay idle.
- Backfill must copy `finished_at` onto `last_scan_finished_at` when the existing row is a completed scan, or a process restart after upgrade would reload the catalog once and then stick until the next scan.

## Implementation

### Files

- `src/musicweb/jobs/runner.py`
- `src/musicweb/db/models.py`
- `src/musicweb/db/migrations/versions/012_scan_last_finished.py`
- `src/musicweb/db/repositories/radio.py`
- `tests/jobs/test_runner.py`
- `tests/radio/test_station.py`

### Steps

1. Add `last_scan_finished_at: Mapped[Optional[str]]` on `ScanState`.
2. Add Alembic revision `012_scan_last_finished` revising `011_radio_station`: nullable string column; backfill `UPDATE scan_state SET last_scan_finished_at = finished_at WHERE kind = 'scan' AND finished_at IS NOT NULL`.
3. Extract `_begin(kind, mode, force)` that writes the running row (today’s field set from `start()` / `_execute()`). `start()` calls `_begin` then starts the thread. `run_sync()` calls `_begin` then `_execute`. `_execute` does **not** write the running row again; it still writes idle/failed at the end.
4. When a job reaches idle and `kind == "scan"`, set `last_scan_finished_at` to the same timestamp as `finished_at`. Regen finish leaves `last_scan_finished_at` untouched.
5. `_progress`: log only (drop `persist=` and the `_set_state` inside it). Phase boundaries that need a persisted `phase` call `_set_state` directly (`_run_scan` / regen methods already do some of this).
6. Log prefix uses `kind` (scan vs regen), not always `"Library scan:"`.
7. `radio_repo.scan_finished_at` returns `row.last_scan_finished_at` (None if missing). Stop inspecting `kind`.
8. Tests: runner — `start` then a mocked `_execute` that asserts the running row was already written and does not need to write it again; a scan finish sets `last_scan_finished_at`; a subsequent regen finish updates `finished_at` / `kind` and leaves `last_scan_finished_at` at the scan timestamp. Station — `test_empty_then_scan_watermark_picks` sets `last_scan_finished_at`; add a case that a regen `kind` + new `finished_at` does **not** by itself change the watermark if `last_scan_finished_at` is unchanged.

### Verify

- `rg -n "persist=" src/musicweb/jobs/runner.py` is empty.
- `rg -n "kind != \"scan\"" src/musicweb/db/repositories/radio.py` is empty.
- `uv run pytest tests/jobs/test_runner.py tests/radio/test_station.py`

## Acceptance

- HTTP and CLI share one `_begin`. `_execute` does not rewrite the running row.
- `_progress` does not open a DB session.
- After a scan then a regen, `scan_finished_at()` still returns the scan timestamp.
- Radio catalog reload is driven only by `last_scan_finished_at` changing.
- Existing libraries migrate: a completed scan row keeps its watermark.
