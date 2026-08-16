# Stage 01: Pin uvicorn WS backend to websockets-sansio

## Status
done

## Description

In the exclusive-audio companion CLI only, stop using the deprecated uvicorn WebSocket backend name `websockets` (legacy adapter on `websockets.legacy`). Pin `ws="websockets-sansio"` instead, with a one-line comment so the choice is intentional next time.

## Rationale

`uvicorn.run(..., ws="websockets")` currently loads the **legacy** protocol implementation and emits `UvicornDeprecationWarning` on every companion start. Upstream will repoint the name `"websockets"` at sansio later; until then the explicit legacy pin is exactly what forces the warning and the deprecated path. Exclusive-audio’s JSON protocol, FastAPI handlers, and browser client sit on ASGI and do not need a rewrite. Library `serve` already omits `ws=` (auto → sansio with `uvicorn[standard]`); only exclusive-audio pins a backend.

## Implementation

1. Edit `src/musicweb/cli/exclusive_audio.py` in `run_exclusive_audio` where uvicorn is started:

   - Change `ws="websockets"` → `ws="websockets-sansio"`.
   - Add a short comment above the `ws=` argument, e.g. that the legacy `websockets` uvicorn backend is deprecated and this pin selects the non-deprecated adapter (not a change to the companion message protocol).

2. Do **not** in this stage:

   - Touch `serve` / other `uvicorn.run` call sites.
   - Change `musicweb/exclusive/` protocol, session, or app handlers.
   - Change browser JS or docs.
   - Add or remove Python package dependencies (`websockets` already comes from `uvicorn[standard]`).

3. Static check: confirm no other `ws="websockets"` remains under `src/`.
