# Stage 01: Idle policy

## Status
done

## Description

Add a pure idle predicate and a `StreamCacheIdle` counter object (in-flight, last-seen, already-swept) with injectable clock and idle threshold. No HTTP, no background task, no `clear_cache` call.

## Rationale

The 3600 s rule and the enter/exit bookkeeping have to be testable without FastAPI, ffmpeg, or a music tree. Stages 02–03 only wire this object.

## Invariants

- `last_seen` is `time.monotonic` (injected `clock`), never wall time.
- Construction stamps `last_seen = clock()`. A fresh object is not due until `idle_after_s` has passed with `in_flight == 0`.
- `mark_enter` increments `in_flight`, stamps `last_seen`, and clears `already_swept`.
- `mark_exit` decrements `in_flight` (not below 0) and stamps `last_seen`.
- `idle_due` is false when `in_flight > 0`, when `now - last_seen < idle_after_s`, or when `already_swept` is true.
- `note_swept()` is the only writer of `already_swept = True`. `mark_enter` is the only clearer.
- Default `idle_after_s` is the module constant `3600`. No env var.

## Risks

- `mark_exit` without a matching enter would drive `in_flight` negative if not clamped. Clamp at 0.

## Implementation

### Files

- Create `src/musicweb/transcode/idle.py`
- Create `tests/test_stream_cache_idle.py`
- Do **not** change `src/musicweb/transcode/__init__.py` (no new barrel export)

### Steps

1. In `idle.py` define source constants `IDLE_AFTER_S = 3600` and `POLL_INTERVAL_S = 60` (poll unused until stage 03; declare it here so the pair lives in one place).
2. Add `idle_due(*, in_flight: int, last_seen: float, now: float, idle_after_s: float, already_swept: bool) -> bool` with the rules in Invariants.
3. Add `StreamCacheIdle` with `__init__(self, *, idle_after_s: float = IDLE_AFTER_S, clock: Callable[[], float] | None = None)`, sync `mark_enter` / `mark_exit` / `due`, and read-only `in_flight` / `already_swept` for tests. Guard mutations with a short `threading.Lock`. Do **not** hold that lock across I/O (there is none yet).
4. Add `note_swept()` (real method, not a test-only hole): under the same lock, set `already_swept = True`. Stage 03’s sweeper calls this after a successful wipe. Tests use a fake clock (`list` + pop, or a mutable `now` box). Cover: not due at t=0; due at `idle_after_s` with no traffic; not due while `in_flight > 0`; `note_swept()` then `due()` is false; `mark_enter` after that clears `already_swept`.

### Verify

- `uv run --group dev pytest tests/test_stream_cache_idle.py`
- `rg "MUSICWEB_|Settings|FastAPI|clear_cache" src/musicweb/transcode/idle.py` — no matches except comments if needed

## Acceptance

- [x] `idle_due` and `StreamCacheIdle` live in `transcode/idle.py` with `IDLE_AFTER_S = 3600` and `POLL_INTERVAL_S = 60`.
- [x] Tests prove due / not-due / in-flight / already-swept / last-seen-on-exit without importing FastAPI or `Transcoder`.
- [x] No env var, no lifespan task, no middleware.
