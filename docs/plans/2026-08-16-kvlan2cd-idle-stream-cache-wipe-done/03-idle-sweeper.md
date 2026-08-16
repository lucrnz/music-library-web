# Stage 03: Idle sweeper

## Status
done

## Description

Poll about every 60 s. When the idle policy is due, run `Transcoder.clear_cache()` while holding a gate that `enter`/`exit` and `POST /api/cache/clear` also await. Stop the poll with an event and drain an in-flight wipe before `transcoder.shutdown()`.

## Rationale

This is the product behavior. Policy (01) and request tracking (02) exist so the wipe cannot run under an open transfer or twice in one idle stretch.

## Invariants

- Sweep runs `Transcoder.clear_cache()` only — never `ProcessCache.shutdown()` while serving. Do not change `clear_cache`’s wait.
- Gate is `asyncio.Lock` created on first use in the running loop (`_ensure_gate`). `enter`, `exit`, `sweep_if_due`, and `run_clear` all `async with` it.
- `sweep_if_due` / `run_clear` hold the gate until `clear_fn` **returns**, not until a cancelled waiter gives up. `asyncio.to_thread` is `create_task` + `await`; on `CancelledError`, `await asyncio.shield(task)` then re-raise, still inside the `async with`.
- A new request’s `enter` waits for that whole wait. It cannot open a `FileResponse` of a file about to be unlinked. **All** HTTP `enter` waits — health, static, browse, play.
- After a successful idle sweep, `note_swept()` so the next polls no-op until `enter` clears the flag.
- Manual `POST /api/cache/clear` uses `request.app.state.stream_cache_idle.run_clear(...)`. It takes the gate but does **not** call `note_swept` (a live session may refill).
- Lifespan: `sweep_task = None` **before** `try`. Start the task after `transcoder.start`. In `finally`, `stop.set()` then `await sweep_task` (if not `None`), **then** `transcoder.shutdown()`. Do **not** `sweep_task.cancel()`.
- First poll wait is `wait_for(stop, timeout=POLL_INTERVAL_S)` — no sweep at t=0. Stop set during a wipe: finish that wipe, then exit; do not start another.
- Sweep errors are logged and the loop continues. `CancelledError` from the loop body still drains `clear_fn` (shield) then propagates.

## Risks

- `clear_cache` waits while `_current is not None`, waking every 5 s (`Condition.wait(timeout=5)`). That 5 s is a poll slice, **not** `Transcoder.shutdown()`’s `_worker.join(timeout=5)`. There is no overall cap. Every HTTP `enter` blocks for that whole wait. A worker that ignores `terminate()` freezes admission until the process is killed. **Accepted** — do not bound or rewrite `worker.py` in this stage (docstring only).
- Two `clear_cache` calls without the gate could interleave `iterdir`/`unlink`. The gate removes that.
- `task.cancel()` on a task awaiting `to_thread` does not stop the thread and would release the gate while unlink still runs, then race `transcoder.shutdown()`. The stop-event + drain + shield path is the fix.

## Implementation

### Files

- Change `src/musicweb/transcode/idle.py` (`_ensure_gate`, `sweep_if_due`, `run_clear`, gated `enter`/`exit`)
- Change `src/musicweb/main.py` (lifespan poll task)
- Change `src/musicweb/routes/media.py` (`cache_clear` uses `run_clear`)
- Change `src/musicweb/transcode/worker.py` (module docstring: idle wipe in addition to shutdown / HTTP clear)
- Change `tests/test_stream_cache_idle.py` (`sweep_if_due` / gate)

### Steps

1. `StreamCacheIdle._ensure_gate() -> asyncio.Lock`. `enter`/`exit` become `async with self._ensure_gate():` then the existing mark methods.
2. Shared helper on the class (not a third lock): `_await_clear(self, clear_fn: Callable[[], int]) -> int` — `task = asyncio.create_task(asyncio.to_thread(clear_fn))`; `try: return await asyncio.shield(task)`; `except asyncio.CancelledError: await task; raise`. Shield the first await so cancelling the waiter does not cancel the thread task. Callers already hold the gate.
3. `async def sweep_if_due(self, clear_fn: Callable[[], int]) -> bool`: under the gate, if not `due()`, return `False`; else `await self._await_clear(clear_fn)`, `note_swept()`, return `True`.
4. `async def run_clear(self, clear_fn: Callable[[], int]) -> int`: under the gate, `return await self._await_clear(clear_fn)`. Do not call `note_swept`.
5. `async def idle_sweep_loop(idle, clear_fn, stop: asyncio.Event, *, poll_s: float = POLL_INTERVAL_S)`: `while not stop.is_set():` `try: await asyncio.wait_for(stop.wait(), timeout=poll_s)` `except TimeoutError: try: await idle.sweep_if_due(clear_fn)` `except asyncio.CancelledError: raise` `except Exception: logger.exception(...)`. A completed `wait_for` means stop was set — exit without starting a sweep.
6. Lifespan: before `try`, `sweep_task = None` and `sweep_stop = asyncio.Event()`. After `transcoder.start`, `sweep_task = asyncio.create_task(idle_sweep_loop(app.state.stream_cache_idle, transcoder.clear_cache, sweep_stop), name="stream-cache-idle")`. In `finally`, `sweep_stop.set()`; `if sweep_task is not None: await sweep_task`; then existing `transcoder.shutdown()`. No `cancel()`.
7. `cache_clear` in `media.py`: `removed["streams"] = await request.app.state.stream_cache_idle.run_clear(transcoder(request).clear_cache)`. Do not add a `routes/deps.py` helper. Drop the bare `run_in_threadpool` on this path.
8. Tests (`asyncio.run`): fake clock + `idle_after_s=1`; `sweep_if_due` calls `clear_fn` once when due (`note_swept` inside) and not again until `enter`; `sweep_if_due` is a no-op when `in_flight > 0`; while `sweep_if_due` is inside a blocking `clear_fn`, a concurrent `enter` does not finish until `clear_fn` returns; cancel a task that is inside `_await_clear` / `sweep_if_due` — `clear_fn` still runs to completion (event or `CancelledError` + shield). Drive `idle_sweep_loop` with a short `poll_s` and `stop.set()` during a blocked `clear_fn`; the loop await returns only after `clear_fn` finishes. Re-run the stage-02 delayed-body ASGI test — gating `enter`/`exit` must not move `exit` earlier than body completion.

### Verify

- `uv run --group dev pytest tests/test_stream_cache_idle.py tests/test_stream_cache_idle_http.py`
- `rg "idle_sweep_loop|sweep_if_due|run_clear|sweep_stop|stream_cache_idle" src/musicweb/main.py src/musicweb/transcode/idle.py src/musicweb/routes/media.py`
- `rg "sweep_task.cancel|task.cancel\\(" src/musicweb/main.py src/musicweb/transcode/idle.py` — no matches
- `rg "app.state.stream_cache_idle.run_clear" src/musicweb/routes/media.py`
- `rg "ProcessCache.shutdown|process_cache.shutdown" src/musicweb/transcode/idle.py` — no matches
- `rg "while self._current|_worker.join" src/musicweb/transcode/worker.py` — wait loop unchanged (docstring only)

## Acceptance

- [x] After `idle_after_s` with `in_flight == 0`, `sweep_if_due` invokes `clear_fn` once; a second call does not until `enter`.
- [x] `enter` waits if a sweep is inside `clear_fn`.
- [x] Lifespan starts a named task after `transcoder.start`, sets a stop event (no `cancel()`), awaits the task, then calls `transcoder.shutdown()`. `sweep_task = None` is assigned before `try`.
- [x] An in-flight `clear_fn` finishes before that `await sweep_task` returns, even if the waiter is cancelled (`shield` drain).
- [x] `POST /api/cache/clear` is `await request.app.state.stream_cache_idle.run_clear(transcoder(request).clear_cache)` (same gate, no `note_swept`).
- [x] Delayed-body ASGI test from stage 02 still holds `in_flight` until the send finishes.
- [x] `Transcoder.clear_cache` wait is unchanged. No `ProcessCache.shutdown()` on the idle path.
