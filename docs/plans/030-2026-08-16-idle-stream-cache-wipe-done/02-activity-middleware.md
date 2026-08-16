# Stage 02: Activity middleware

## Status
done

## Description

Attach one `StreamCacheIdle` to the FastAPI app and wrap every HTTP request in a raw ASGI middleware so enter/exit span the full body send. Still no automatic wipe.

## Rationale

The sweeper in stage 03 is only safe if live requests are visible, including a long `FileResponse`. Middleware-only is a no-op for operators and can ship without changing cache contents.

## Invariants

- `in_flight` covers the full ASGI HTTP call: enter before the inner app is invoked, exit in `finally` after that call returns (body send finished or cancelled). Not at `http.response.start`.
- Non-`http` scopes (lifespan, a future library-process WebSocket) pass through uncounted.
- Do **not** use `@app.middleware("http")`, `call_next`, or `BaseHTTPMiddleware` for this feature. Those return when headers start and would drop `in_flight` at the start of `GET /api/stream`.
- Enter/exit that stage 03 will later serialize behind an asyncio gate must already be `async` so 03 does not rewrite the wrapper.
- The stage-01 `threading.Lock` stays short (counter updates only). The ASGI wrapper itself does not block the event loop.
- Control-socket traffic is not HTTP and must not go through this object.

## Risks

- `add_middleware` after routes still wraps mounted `/static` and the SPA catch-all; if a future middleware is added, confirm order once. Accepted: one wrapper today.
- A hung request holds `in_flight > 0` forever and delays idle wipe. Accepted (same as “a client is still connected”).

## Implementation

### Files

- Change `src/musicweb/transcode/idle.py` (async `enter` / `exit`; `StreamCacheIdleMiddleware`)
- Change `src/musicweb/main.py` (`create_app`: `app.state.stream_cache_idle`, `add_middleware`)
- Change `tests/test_stream_cache_idle.py` (async enter/exit)
- Create `tests/test_stream_cache_idle_http.py` (tiny Starlette/FastAPI app as raw ASGI — no `create_app()`, no `httpx`)

### Steps

1. Add `async def enter(self)` / `async def exit(self)` on `StreamCacheIdle` that call the sync mark methods. In this stage they do not wait on a sweep gate yet; keep the signatures async so 03 can await a lock inside them.
2. Add `StreamCacheIdleMiddleware` in the same file (~ten lines): `__init__(self, app, idle)`, `async def __call__(self, scope, receive, send)`. If `scope["type"] != "http"`, await `self.app(...)` and return. Else `await self.idle.enter()`; `try: await self.app(scope, receive, send)`; `finally: await self.idle.exit()`.
3. In `create_app`, construct `StreamCacheIdle()` onto `app.state.stream_cache_idle` (same place as `ProcessCache` / `Transcoder`). After routes/mounts, `app.add_middleware(StreamCacheIdleMiddleware, idle=app.state.stream_cache_idle)`. Do not register `@app.middleware("http")`.
4. Do not start a sweep task. Do not import `IDLE_AFTER_S` into `main.py`.
5. HTTP test: build a **minimal** `FastAPI`/`Starlette`, wrap it with the **same** `StreamCacheIdleMiddleware` class, drive it with raw ASGI `scope`/`receive`/`send` (no `TestClient`, no project `create_app`). One route must be a delayed body (`StreamingResponse` whose generator sets an Event then waits on a second Event before yielding). Run `app(scope, receive, send)` as a task; after the start Event, assert `in_flight == 1`; then release the hold Event; after the task completes, assert `in_flight == 0` and `due()` is false. A handler-only check is not enough — it would pass if `exit` ran at `http.response.start`.

### Verify

- `uv run --group dev pytest tests/test_stream_cache_idle.py tests/test_stream_cache_idle_http.py`
- `rg "StreamCacheIdleMiddleware|stream_cache_idle" src/musicweb/main.py src/musicweb/transcode/idle.py`
- `rg "middleware\\(\"http\"\\)|call_next|BaseHTTPMiddleware" src/musicweb/main.py src/musicweb/transcode/idle.py` — no matches
- `rg "create_app\\(|TestClient|httpx" tests/test_stream_cache_idle_http.py` — no `create_app` / `httpx` / `TestClient`

## Acceptance

- [x] `in_flight == 1` while a delayed body is still being sent; `== 0` only after the ASGI call returns.
- [x] `create_app()` installs `StreamCacheIdleMiddleware` against `app.state.stream_cache_idle`.
- [x] No `@app.middleware("http")` / `call_next` / `BaseHTTPMiddleware` in this feature’s files.
- [x] Cache files are never deleted in this stage.
- [x] Full library app is not booted in tests.
