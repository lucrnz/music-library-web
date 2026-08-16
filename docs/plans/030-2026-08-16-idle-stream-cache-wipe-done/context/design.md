> **Archive.** Decisions in this file were current as of 2026-08-16 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Idle stream-cache wipe

## Goal

When the library server has had no HTTP client for about an hour, empty the process-temp transcode cache so overnight idle hosts do not keep completed encodes on disk until the next process restart.

## Settled decisions

- **Connected** means last HTTP request to the library process, plus any request still in flight. A long `GET /api/stream` (HTML audio, exclusive mpv, or a download worker) stays connected until that response finishes.
- **Any HTTP counts:** `/api/*`, `/`, `/static/*`, `/sw.js`, health, diag ingest, browse. Control-socket CLI does not. Exclusive companion WebSocket does not (different process); mpv/prepare HTTP on this server does.
- An open tab that sends nothing is **not** connected. After ~1 hour the cache goes away and the next play re-encodes.
- Background downloads keep the cache (they `GET /api/stream`). An uptime probe that hits this process on an interval shorter than the idle window also keeps it.
- **Around 1 hour** is source constants: idle after `3600` s, poll about every `60` s. Not env, not Settings, no off switch.
- **Empty** means existing `Transcoder.clear_cache()` (same as `POST /api/cache/clear`): drop queued jobs, cancel a running encode, delete `streams/` children. Do **not** call `ProcessCache.shutdown()` while serving.
- One wipe per idle stretch. Skip if already wiped since the last request.
- Sweeper and request entry share a gate so a new transfer cannot start against files being deleted.
- That gate blocks **every** HTTP `enter` (health, static, browse, play) for the whole `clear_cache` wait. `clear_cache` waits until `_current` is gone (`Condition.wait(timeout=5)` slices, **no overall cap**). A worker that ignores `terminate()` freezes admission. **Accepted.** Do not add a timeout or rewrite `worker.py` in this plan.
- Lifespan **drains** an in-flight wipe before `transcoder.shutdown()`. Stop the poll with an `asyncio.Event` and `await` the task. Do **not** `cancel()` the sweep task: `asyncio.to_thread` does not stop the worker thread, and cancel-then-shutdown races unlink vs `_temp_dir = None` / `rmtree`.
- Operator signal is the existing `clear_cache` log line. No toast, no Settings UI.
- Presence is a **raw ASGI wrapper** in `transcode/idle.py` (`StreamCacheIdleMiddleware`). `await inner(scope, receive, send)` returns after the body has finished (or the client dropped). Do **not** use `@app.middleware("http")` / `call_next` / `BaseHTTPMiddleware` — those return at `http.response.start` and would drop `in_flight` at the start of a long `GET /api/stream`.
- `already_swept` is flipped by a real `note_swept()` method (tests in 01, sweeper in 03). No second setter.

## Design

The library process has no client registry. Presence is reconstructed from HTTP:

1. A small `StreamCacheIdle` object on `app.state` records `in_flight`, `last_seen` (`time.monotonic`), and whether this idle stretch was already swept.
2. A raw ASGI HTTP wrapper increments `in_flight` and stamps `last_seen` on enter, invokes the inner app, then decrements and stamps again on exit in `finally`. Non-`http` scopes pass through uncounted. A two-hour `FileResponse` stays in-flight until the send completes.
3. A lifespan asyncio task waits on a stop `Event` with timeout `POLL_INTERVAL_S`, then if due runs `Transcoder.clear_cache()` while holding the same gate `enter` awaits. Shutdown sets the event and awaits the task (current wipe finishes) before `transcoder.shutdown()`.
4. `last_seen` starts at construction (process start). An unused server becomes due after one hour; `clear_cache` on an empty `streams/` is cheap. After a successful idle wipe, further polls no-op until the next `enter`.
5. Manual `POST /api/cache/clear` uses `request.app.state.stream_cache_idle.run_clear(transcoder(request).clear_cache)` so it shares the gate. It does not flip the “already swept” flag (a live client may refill the cache immediately).

`idle_due(...)` is a pure predicate so the 3600 s rule is unit-tested without FastAPI, ffmpeg, or a library path. Intervals stay next to the policy (`transcode/idle.py`), not in `Settings`.

## Stage map

1. **Idle policy** — predicate + in-memory counters. Nothing listens yet; later stages have something to test against.
2. **Activity middleware** — raw ASGI wrapper stamps every HTTP request for the full body lifetime. Must exist before the sweeper is safe: a sweeper with only a startup `last_seen` would wipe under active clients after one hour.
3. **Sweeper** — lifespan poll + `clear_cache` behind the gate; drain before `transcoder.shutdown()`. Depends on 01 and 02.
4. **Living docs** — last. Cache lifetime is already documented as shutdown-only; that sentence becomes false after 03.

## Out of scope

- Env knob, disable switch, or Settings UI.
- SPA heartbeat / visibility / WebSocket presence.
- LRU, size cap, or per-file TTL.
- Treating exclusive companion WS or the control socket as connected.
- Changing the `POST /api/cache/clear` request/response shape.
- Bounding or rewriting `Transcoder.clear_cache` (no overall wait cap, no worker change except its module docstring).
- Wiping covers, diag JSONL, or client OPFS downloads.
- Frontend changes.

## Assumptions

- An ASGI wrapper added via `app.add_middleware` sees `/api`, static, SPA, and `/sw.js`. It does not see the control-socket UDS thread.
- `clear_cache`’s `wait(timeout=5)` is a poll slice, not a deadline. Admission stays blocked until `_current` clears.
- Cancelling a task that is awaiting `asyncio.to_thread` does not stop the thread. Shutdown must drain that work, not `cancel()` it.
- Unlinking a cache file on Linux does not stop an already-open `FileResponse` fd; we still refuse to sweep while `in_flight > 0` so the *next* Range and new encodes are not racing a wipe.
- Tests do not boot `create_app()` (that needs a library path and ffmpeg). Policy, ASGI middleware, and `sweep_if_due` are tested with fakes.
- Async tests use `asyncio.run`; do not add `pytest-asyncio` or `httpx` just for this plan.
- Browser `Cache-Control: private, max-age=3600` on `/api/stream` is unrelated client HTTP cache.
