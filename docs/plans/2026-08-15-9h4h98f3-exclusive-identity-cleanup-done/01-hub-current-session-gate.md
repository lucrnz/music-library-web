# Stage 01: Hub current-session gate

## Status
done

## Description

Make “this `ClientSession` is the current socket / live controller” a locked predicate. `handle_message` and `_handle_controller` use it before player work and again before hub writes. Extend hub tests for TTL-then-`LOAD` and mid-flight replace.

## Rationale

The unlocked identity peek is why a displaced or TTL-demoted socket can still `LOAD`. Closing that gate is the only review finding that can still mutate mpv.

## Invariants

- `_is_current` / `_is_live_controller` are only read while holding `_lock`.
- `_is_live_controller` is current **and** `role == controller` **and** `_controller_id == sess.session_id`.
- Heartbeat and `LIST_DEVICES` require `_is_current` only.
- Playback commands require `_is_live_controller` before `to_thread` and before `_device_id` / `broadcast`.
- `_lock` is not held across `to_thread` or `broadcast()`.
- `_device_id` is assigned only after `set_device` returns **and** the after-check passes.
- A stale in-flight `to_thread` is not followed by `STOP`.
- Hello-replace still keeps the controller claim and still closes the old socket outside the lock.
- `handle_disconnect` uses `_is_current` (same meaning as today’s `is not sess` peek, just the helper).

## Risks

- Holding `_lock` into `broadcast()` deadlocks. After-check must end before `await self.broadcast(...)`.
- Gating only on identity misses TTL (same object, role flipped). That is why `_is_live_controller` is fail-closed on all three fields.
- A mid-flight `SET_DEVICE` may still change `FakePlayer._device` / real mpv. Hub `_device_id` must not follow it.

## Implementation

### Files

- Change `src/musicweb/exclusive/session.py`
- Change `tests/test_exclusive_hub_release.py`
- Do **not** change client JS this stage

### Steps

1. Add `_is_current(self, sess) -> bool` and `_is_live_controller(self, sess) -> bool` on `ExclusiveHub`. No wrapper that awaits work inside the lock.
2. `handle_disconnect`: replace the inline `get(...) is not sess` with `_is_current`.
3. `handle_message`:
   - `async with self._lock`: if not `_is_current`, return. Heartbeat updates `last_heartbeat` here and returns. Snapshot `_is_live_controller` for the readonly vs controller split.
   - `LIST_DEVICES`: re-check `_is_current` under the lock before listing/sending; not a controller command.
   - If the snapshot was not live controller, send the existing readonly error and return.
   - Else `try: await _handle_controller`.
4. `_handle_controller` for each playback command:
   - `async with self._lock: if not _is_live_controller: return`
   - validate args (so a displaced socket with a bad payload is a silent no-op, not an error send)
   - `await asyncio.to_thread(...)`
   - if the command writes `_device_id` or broadcasts: `async with self._lock: if not _is_live_controller: return` then assign `_device_id` if needed; **then** release the lock and `await self.broadcast(...)`
   - `PAUSE` / `RESUME` / `SEEK` have no hub write — before-check only
5. `SET_DEVICE`: delete the `_device_id = device_id` that currently sits **before** `set_device`.
6. Tests — keep `test_displaced_handle_message_is_noop` and the hello-replace trio.
7. `FakePlayer`: optional `threading.Event` `gate`; `entered_load` / `entered_set_device` events. `load` and `set_device` set entered, wait on `gate` if set, then apply. `release_device` never waits.
8. `test_ttl_then_load_is_noop`: controller + device, expire heartbeat, `_check_ttl`, then `handle_message(LOAD)`. `load_calls == []`. Controller gone, device released, sess still in `_clients` as readonly.
9. `test_midflight_load_replace_skips_hub_write`: arm `gate`, `create_task(handle_message(old, LOAD))`, wait `entered_load` (timeout 2s), hello-replace, `gate.set()`, await the task. New sess is controller; `_device_id` unchanged; old ws has no `STATUS` from that load. Do not assert `load_calls == []`.
10. `test_midflight_set_device_replace_skips_device_id`: same shape with `SET_DEVICE` to a new id. After join, `hub._device_id` is still the pre-command value.

### Verify

- `uv run --group dev pytest tests/test_exclusive_hub_release.py`

## Acceptance

- [ ] Unlocked identity peek in `handle_message` is gone.
- [ ] Live-controller is fail-closed on current + role + `_controller_id`.
- [ ] `_device_id` cannot move on a stale `SET_DEVICE`.
- [ ] TTL-then-`LOAD` does not call `load`.
- [ ] Mid-flight replace tests pass without requiring `load_calls == []`.
- [ ] Existing replace / disconnect / release-failure tests still pass.
