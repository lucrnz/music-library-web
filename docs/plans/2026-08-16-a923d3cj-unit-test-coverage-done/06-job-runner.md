# Stage 06: Job runner

## Status
done

## Description

Test `LibraryJobRunner` single-flight, cancel, and ScanState transitions with a tmp migrated DB. Always patch `_execute` so no real scan or enrichment runs.

## Rationale

HTTP and CLI both funnel writes through this runner. Double-start and cancel are easy to break and invisible without tests.

## Invariants

- At most one job (`start` → False / `run_sync` → `RuntimeError` while `_running`).
- `request_cancel` on idle is False and does not flip ScanState to `canceling`.
- `start()` writes ScanState `running`. `_thread_main` only clears `_running` after `_execute` returns; it does **not** write `idle`. A patched `_execute` therefore leaves status `running` after `start()` unless the test writes idle itself — do not require `idle` after mocked `start()`.
- Stores (`CoverStore`, `ArtistImageStore`) may be real objects rooted at `tmp_home.data`; their encode/fetch methods must not be called.
- Do not start a thread that runs a real library walk of the developer’s collection.
- Patch `_execute` only. Do not mock `_thread_main`. Do not patch walk/batch.

## Risks

- `start` spawns a daemon thread. Every test that calls `start()` must `shutdown()` and join. Assert no thread named `library-job` remains.

## Implementation

### Files

- Create: `tests/jobs/test_runner.py`

### Steps

1. Helper `_runner(tmp_home, db)` builds `Library(tmp_home.lib)`, `CoverStore(tmp_home.data)`, `ArtistImageStore(tmp_home.data)`, `LibraryJobRunner(...)`.
2. **status idle:** after `init_database`, `status()["status"] == "idle"`.
3. **single-flight start:** patch `_execute` to block on `threading.Event`. First `start("scan")` is True and `status()["status"] == "running"`. Second `start("scan")` is False. `run_sync` raises `RuntimeError`. Always `shutdown()` after releasing the event. `is_running` is False. Do not assert ScanState `idle`.
4. **run_sync busy:** use the same blocked-`_execute` thread as step 3 (do not poke `_running` by hand) → `run_sync` raises.
5. **request_cancel idle:** False; `status()["status"]` stays `"idle"`.
6. **request_cancel running:** start blocked `_execute`; `request_cancel()` True; ScanState `status == "canceling"`; then release and `shutdown()`.
7. **run_sync mocked execute:** `_execute` records `(kind, mode, force)` and returns; `run_sync("regen-covers", force=True)` calls it once and `is_running` is False afterwards. Second case: `_execute` raises; `is_running` is still False after the exception.

Do not test `_run_scan` internals (that is stage 05). Do not test regen cover/lyrics/artist phases.

### Verify

```sh
uv run --group dev pytest tests/jobs/test_runner.py
uv run --group dev pytest
```

Confirm no thread is left alive (`threading.enumerate` should not contain `library-job` after the test module).

## Acceptance

- [ ] Second `start` returns False; `run_sync` while the blocked thread is running raises.
- [ ] Idle `request_cancel` is False and status stays `idle`.
- [ ] Running `request_cancel` is True and status is `canceling`.
- [ ] After `run_sync` with a returning or raising `_execute` stub, `is_running` is False.
- [ ] After mocked `_execute` via `start()`, tests do not require status `idle`.
- [ ] Tests never walk a real library or call ffmpeg.
