# Stage 03: Companion CLI, HOG_TOKEN, and pinned WebSocket protocol

## Status
pending

## Description

Add `musicweb exclusive-audio`: loopback companion using **Starlette/FastAPI + uvicorn** on **127.0.0.1:18765** (port overridable), requiring **`HOG_TOKEN`** and **mpv**, with canonical protocol in `musicweb/exclusive/protocol.py`. Playback commands can stub until stage 04; hello, lock, heartbeat, and status must work.

## Rationale

Deps already include FastAPI/uvicorn—no new WS package. Fixed port and env token make PWA settings stable. A single protocol module stops 03/04/06 from inventing incompatible messages.

## Implementation

- Package: `src/musicweb/exclusive/` (`protocol.py`, app/server) + `src/musicweb/cli/exclusive_audio.py`; Typer command `exclusive-audio`.
- **Do not** take `musicweb.lock`, open DB, migrate, or import HTTP server lifespan/bootstrap.
- Startup fail-fast:
  1. `HOG_TOKEN` non-empty (print export + “paste same value into Mac PWA settings”).
  2. mpv on `PATH` or `--mpv`.
  3. Bind **127.0.0.1** only; default port **18765** (`--port` override).
- Run with uvicorn (or equivalent) serving a tiny FastAPI/Starlette app—loopback only.
- **`protocol.py`:** version constant; message types and required fields documented as the canonical schema. Envelope: `{ "v", "type", ... }`.
  - Client → server: `hello` `{ token, sessionId }`, `heartbeat` `{}` (~5s).
  - Server → client: `hello_ok` (include role `controller` | `readonly`), `hello_reject`, `status`; playback types reserved/stubbed for stage 04.
  - **Lock:** first successful hello becomes **controller**; further sessions connect **read-only** (`controlled elsewhere`); cannot set device/play later.
  - **TTL:** ~15s without heartbeat → release controller lock + notify; socket close releases that session’s claim.
- Print port and setup hints on success.
- Manual: missing token/mpv fail; two clients → second readonly; stop heartbeats → lock frees after TTL.
