# Stage 02: Control RPC and loop-safe notify

## Status
done

## Description

Expose the stage 01 station verbs on the existing Unix control plane and, after skip/play/reset that change current or `started_at`, schedule the existing radio tick listener on the asyncio loop so tuned-in clients receive the normal now-playing snapshot immediately.

## Rationale

The CLI cannot reach in-memory station state without the control socket. Listener catch-up is this hop onto the event loop: `NowPlayingHub.schedule` already no-ops off-loop, which is why a control-thread mutation would otherwise sit until the next tick.

## Invariants

- RPC result dicts include upcoming ids and banlist ids only when the request param `spoilers` is true (default false).
- Successful `radio_skip`, `radio_play` (current actually changed), and `radio_reset` schedule `station.notify_loop` via `loop.call_soon_threadsafe`. `radio_play` no-op, `radio_pick`, `radio_skip_ids`, and `radio_skip_ids_clear` do not.
- No new HTTP routes. No new WebSocket client actions. Snapshot payload stays `serialize(now_playing)`.
- Radio/control logs never print upcoming ids or upcoming titles.
- If the station is not bound, radio methods return `ok=false`. Mutation error codes from stage 01 map to `ok=false` with that error string; the station is not left half-written.
- Tests do not call `create_app` or start uvicorn.

## Risks

- Lifespan forgets to bind the loop: mutations succeed and listeners lag until the next tick. Mitigation: bind in `main.py` lifespan after the station exists and the loop is running; test that a bound loop receives `call_soon_threadsafe`; if the loop is unbound, mutation still succeeds and does not crash.
- `call_soon_threadsafe(notify_loop)` after the lock is released is required to avoid the deadlock noted in stage 01.

## Implementation

### Files

- `src/musicweb/control/server.py`
- `src/musicweb/control/client.py`
- `src/musicweb/main.py`
- `tests/control/test_radio.py`

### Steps

1. Extend `ControlServer` with bind methods (or optional constructor fields) for the live `RadioStation` and the running `asyncio.AbstractEventLoop`. Leave the existing jobs-only constructor call site as-is.
2. In `src/musicweb/main.py` lifespan, after `RadioStation` / tuners / prepare / `bind_station_listener` exist, bind station + tuners + `asyncio.get_running_loop()` onto `app.state.control_server` (when present), then `control.start()` as today.
3. Dispatch these methods in `ControlServer._dispatch`, each calling the stage 01 station API and `musicweb.radio.debug` helper (tuners from the bind):
   - `radio_status` (`spoilers` bool, default false)
   - `radio_skip` (`spoilers`)
   - `radio_play` (`track_id`, `spoilers`)
   - `radio_pick` (`spoilers`)
   - `radio_reset` (`spoilers`)
   - `radio_banlist` (`spoilers`)
   - `radio_skip_ids`
   - `radio_skip_ids_clear`
4. After a successful skip/play/reset whose mutation result says current or `started_at` changed, if a loop is bound, `loop.call_soon_threadsafe(station.notify_loop)`. Do not call `notify_loop` on the control thread.
5. Add matching wrappers on `ControlClient` in `src/musicweb/control/client.py`.
6. Add `tests/control/test_radio.py`: drive `_dispatch` (or a temporary UDS + `ControlClient`) against a real `RadioStation` on the tmp-db fixture used by radio tests. Assert spoilers filtering, catching_up / idle skip errors, play inject, and that `call_soon_threadsafe` is invoked only for skip/play(changed)/reset. Do not import `create_app`.

### Verify

```sh
uv run --group dev pytest tests/control/test_radio.py tests/radio/test_station_dj.py
```

## Acceptance

- Every `musicweb radio` verb in [context/design.md](context/design.md) has a control method that returns the debug status/banlist/skip-ids dict from stage 01.
- `spoilers=false` responses contain no upcoming track ids and no banlist track ids.
- Skip / changing play / reset schedule `notify_loop` on the bound loop; pick and skip-ids do not.
- `src/musicweb/cli/serve.py`, `src/musicweb/routes/radio.py`, and `frontend/` are unchanged.
