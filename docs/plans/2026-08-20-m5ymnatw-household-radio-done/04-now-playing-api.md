# Stage 04: Now-playing API

## Status
done

## Description

Expose the current station face over HTTP snapshot + WebSocket. No upcoming tracks. No tune messages and no prepare.

## Rationale

The Radio tab and the stopped bar need a clock they can subscribe to before Tune-in exists. Shipping `catching_up` / `skip_pending` / `idle` / `current` without audio keeps spoiler and face shapes reviewable on their own.

## Invariants

- Response/WS bodies contain only the face plus the **current** track when `current`. No next id, no queue length, no batch ids. `position` is a float in **seconds**, clamped to `[0, duration]`.
- `GET /api/radio/now` is 200 for `catching_up`, `skip_pending`, and `idle` (explicit face, no track fields). There is no HTTP 409. Missing current id never calls `track_dict(None)`.
- Library process had no WebSocket routes; this is the first. Exclusive companion WS stays on the loopback companion process.
- `StreamCacheIdleMiddleware` ignores non-`http` scopes. The radio WS does not reset the on-demand cache idle timer and does not start prepare.
- Client messages in this stage: none. Any client payload **closes** the socket. `tune_in` / `tune_out` are added as the allowlist in stage 05.

## Risks

- A debug field like `remaining_in_batch` is a spoiler. Do not add it.
- Treating `catching_up` as `idle` makes a restart look like an empty library.
- Treating a missing current row as `idle` collapses “deleted track” with “empty library.” Use `skip_pending`.

## Implementation

### Files

- `src/musicweb/radio/now_playing.py` (snapshot serialization)
- `src/musicweb/radio/protocol.py` (stage 04: “any client payload → close”; stage 05 extends the allowlist)
- `src/musicweb/routes/radio.py`
- `src/musicweb/routes/api.py`
- `src/musicweb/routes/serializers.py` (reuse `track_dict`; do not invent a second track DTO)
- `frontend/vite.config.ts` (`ws: true` on the existing `/api` proxy)
- `tests/radio/test_now_playing.py`
- `tests/radio/test_protocol.py`

### Steps

1. Stage 03 already stashes `StationSnapshot` on the station (built inside `to_thread` with the session open). `station.now_playing()` returns that object. It does not import `routes.serializers` and does not open a session.
2. `now_playing.py` is a **pure serializer**: `StationSnapshot` → HTTP/WS dict. When the snapshot has a current `Track` row (or the display/tech fields copied from one), it may call `track_dict`. Faces without a track omit track fields. `position` is seconds, clamped to `[0, duration]`. The event-loop listener never queries SQLite.
3. `GET /api/radio/now` and `WebSocket /api/radio/ws`: accept, send a snapshot, then send on face/track/skip change and a position snapshot about once a second. `protocol.py`: any client text/JSON → close. Disconnect is not Tune-out (no tuners yet).
4. After each `to_thread` tick/catch-up returns, the **one** event-loop listener serializes the already-stashed snapshot and pushes it. Stage 05 will add prepare refresh on this same listener. Do not put FastAPI types in `radio/station.py`.
5. Include `radio.router` from `routes/api.py`.
6. `frontend/vite.config.ts`: set `ws: true` on the existing `/api` proxy (`timeout: 0` stays). Without this, `pnpm --dir frontend dev` cannot upgrade `/api/radio/ws`.
7. Tests hit `now_playing.serialize` and `protocol.client_payload_action` (close vs later allowlist). Assert dict keys exclude any next/queue/batch field; `skip_pending` has no track; position is seconds; callback fires on advance. Mock the station — do not boot `create_app`, do not use TestClient / httpx.

### Verify

- `uv run --group dev pytest tests/radio/`
- Confirm `frontend/vite.config.ts` `/api` proxy has `ws: true`.

## Acceptance

- Snapshot and WS payload can render `catching_up`, `skip_pending`, idle, or current (cover, title, artist, album, `position` in seconds, duration, lossy/source tech). Missing current does not 500.
- No upcoming track data on the wire.
- No tune protocol, no `/api/radio/stream`, and no `Transcoder` calls in this stage.
- Vite `/api` proxy upgrades WebSockets (`ws: true`).
