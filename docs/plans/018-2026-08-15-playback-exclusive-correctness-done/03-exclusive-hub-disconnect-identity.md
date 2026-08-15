# Stage 03: Exclusive hub disconnect identity

## Status
done

## Description

`handle_disconnect` and `handle_message` no-op unless the `ClientSession` is still mapped for that `sessionId`. Hello-replace of the same `session_id` keeps the controller claim, closes the displaced websocket outside the lock, and must not release hog.

## Rationale

`docs/systems/exclusive-audio.md` already says never release on hello replace. The old socket’s `finally` still calls disconnect by `session_id` and evicts the new controller. Identity deletes that class of bug. Closing the old socket is required so the receive loop dies; it is not optional hygiene. Close is not a full identity boundary: the displaced loop still calls `handle_message(sess, …)` on a local object whose `role` stays controller until `close()` wins.

## Invariants

- Controller disconnect and heartbeat TTL still `ensure-release`.
- Readonly disconnect still does not release.
- Hello-replace of the same `sessionId` still does not call `release_device`.
- Hello-replace of the same `sessionId` **keeps** the controller claim (no `_controller_id = None` dance).
- Release-then-clear on `release_device` failure is unchanged (`_device_id` stays set if release raises).

## Risks

- Signature change must update `app.py` `finally` and every test call site (`handle_disconnect("c1")` → the session object).
- Close the old websocket **after** releasing the hub lock. Closing inside the lock can deadlock with send.
- Compare `sess is _clients[session_id]`. Comparing only `session_id` is the bug.
- `FakeWebSocket` needs an async `close()` so tests can assert the displaced socket was closed.

## Implementation

### Files

- Change `src/musicweb/exclusive/session.py`
- Change `src/musicweb/exclusive/app.py`
- Change `tests/test_exclusive_hub_release.py`

### Steps

1. `handle_disconnect(sess)`: if `_clients.get(sess.session_id) is not sess`, return. Otherwise pop, and if it was controller, `ensure-release` as today.
2. `handle_message(sess, msg)`: same predicate first — if `sess is not _clients.get(sess.session_id)`, return. Do not run controller commands on a displaced session.
3. `ws_endpoint` `finally`: `if sess is not None: await hub.handle_disconnect(sess)`.
4. Hello-replace, inside the lock: pop `old`. If `_controller_id is None` or `_controller_id == session_id`, new sess is controller and `_controller_id = session_id`; else readonly. Do **not** set `_controller_id = None`. After the lock: close `old.websocket` if it was present and still connected. Do not `ensure-release` on that path.
5. Tests (existing fakes; add async `close()` on `FakeWebSocket`):
   - Hello-replace still does not release (keep).
   - Hello-replace then `handle_disconnect(old_sess)` → still controller, still `_device_id`, `release_calls == 0`, new sess still mapped.
   - Hello-replace **closed** the old websocket (assert `close` was awaited).
   - `handle_disconnect(new_sess)` after replace still releases.
   - Displaced `handle_message(old_sess, load/play)` is a no-op (no player load, still controller on the new sess).
   - Existing controller / TTL / readonly / failure-keeps-id cases still pass. Update call sites to pass `sess`, not a string id.

### Verify

- `uv run --group dev pytest` — especially `tests/test_exclusive_hub_release.py`

## Acceptance

- [x] Displaced-session disconnect is a no-op for map, role, and hog.
- [x] Displaced-session `handle_message` is a no-op.
- [x] Live mapped controller disconnect still releases.
- [x] Hello-replace closes the old websocket outside the lock.
- [x] Hello-replace of the same `session_id` never clears `_controller_id` to `None`.
- [x] Pytest covers replace-then-old-disconnect, old-socket close, and displaced message.
