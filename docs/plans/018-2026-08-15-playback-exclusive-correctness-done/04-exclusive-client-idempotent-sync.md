# Stage 04: Exclusive client idempotent sync

## Status
done

## Description

Ignore `onclose` unless `event.target === ws`. Make `syncCompanionConnection` a no-op when already `OPEN` or `CONNECTING` for the same `inFlightKey`. Persist the token on every `@input`; `commitHogToken()` on `@change`. Empty token and disable disconnect immediately. No debounce timer.

## Rationale

The client always `close()`+`connectNow()` to “sync.” Debouncing that teardown still murders a live controller (and re-enters the hub replace path) every idle interval. Idempotent same-key sync deletes the teardown. Stale `onclose` still has to ignore the old socket. Token keystrokes are persist, not reconnect — the field already has a commit event (`@change`, same as port). A 400ms timer in `companionClient.js` is connection code modeling a text field.

## Invariants

- Companion URL stays `ws://127.0.0.1:{port}/ws`.
- Enable/disable is immediate.
- `syncPreferredDevice` / `ensurePreferredDevice` unchanged once a socket is actually open.
- Token still persists on every `@input`. Reconnect waits for `@change` (blur / commit). Empty token disconnects on input, not on blur.

## Risks

- Same-key no-op while `CONNECTING` must not drop a needed hello. Desired key is `port + trimmed token` while `should` is true. If hello is in flight for that key, a second sync is a no-op.
- `close()` is async (`CLOSING`). `connectNow` assigns a **new** `WebSocket` to `ws`; do not treat `CLOSING` as live; do not wait for `onclose` before connecting.
- Do not add `{ debounce }` or a timer. A captured-key timer after the user deletes back to the live token would close the live socket.
- Empty token is not a commit to wait for: `disconnectCompanion()` from `setHogToken` now.
- `intentionalClose` alone does not protect the module `ws` binding. `event.target === ws` is required.

## Implementation

### Files

- Change `src/musicweb/static/js/exclusive/companionClient.js`
- Change `src/musicweb/static/js/stores/exclusiveAudio.js` (`setHogToken` persist-only; add `commitHogToken`)
- Change `src/musicweb/static/js/components/settings/ExclusiveAudioPanel.js` (token `@change` → `commitHogToken`)

### Steps

1. `onclose`: if `event.target !== ws`, return (no `ws = null`, no `disconnected`, no `disconnect` emit).
2. Desired key = current `port` + trimmed token. `inFlightKey` is set **only** in `connectNow`, cleared in `disconnectCompanion`. `syncCompanionConnection()` (no debounce argument):
   - If `!should` (not capable/enabled or empty token): `disconnectCompanion()`, return.
   - If `should` and `ws` is `OPEN` or `CONNECTING` and desired key equals `inFlightKey`: return.
   - Otherwise: if an existing `ws` is for a **different** key, `intentionalClose` and `close()` (do not wait; readyState will be `CLOSING`). Then `connectNow()`. Do not close a same-key socket.
3. `connectNow`: existing `OPEN`/`CONNECTING` early return stays (belt). Creating the socket sets `inFlightKey` to the desired key from current settings and assigns `ws = new WebSocket(...)`.
4. `setHogToken`: persist. If trimmed token is empty, `disconnectCompanion()`. Do **not** sync on a non-empty keystroke.
5. `commitHogToken()`: dynamic-import `syncCompanionConnection()` (same pattern as enable/port). `ExclusiveAudioPanel`: keep `@input="onToken"` → `setHogToken`; add `@change` → `commitHogToken`.
6. `setExclusivePort` / `setExclusiveEnabled`: persist, then `syncCompanionConnection()` immediately.

### Verify

- `uv run --group dev pytest`
- Companion + settings (Mac PWA or DevTools WS):
  - Connected. `syncCompanionConnection()` again with the same token/port: **no** close, socket stays up.
  - Type several token characters without leaving the field: persist updates, socket stays up.
  - Blur / commit a new token: one reconnect, status does not stick on disconnected while the new socket is open.
  - Clear the token: disconnect immediately (do not wait for blur).
  - Toggle enable off/on: immediate disconnect/connect.
  - Change port (`@change`): immediate reconnect.

## Acceptance

- [x] Stale `onclose` cannot clear a newer `ws`.
- [x] Same-key sync does not close an OPEN/CONNECTING socket.
- [x] Token persist is `@input`; token reconnect is `commitHogToken` on `@change`; empty token and enable are immediate.
- [x] `inFlightKey` is set only in `connectNow` and cleared in `disconnectCompanion`.
- [x] No debounce timer in `companionClient.js` or the settings store.
