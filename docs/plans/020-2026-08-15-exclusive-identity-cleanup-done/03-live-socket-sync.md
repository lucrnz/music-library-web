# Stage 03: isLiveSocket for companion sync

## Status
done

## Description

Collapse the twin `OPEN` / `CONNECTING` checks in `syncCompanionConnection` behind `isLiveSocket`. Use the same helper in `connectNow`. Document that `close()` is `CLOSING` so a different-key sync can assign a new `WebSocket`.

## Rationale

Same-key no-op vs different-key replace is one branch written twice. The `CLOSING` contract is load-bearing and currently implicit.

## Invariants

- `isLiveSocket(socket)` is true only for `OPEN` or `CONNECTING` (not `CLOSING` / `CLOSED` / null).
- Live + same `desiredConnectKey()` as `inFlightKey` → return (no close, no new socket).
- Live + different key → `intentionalClose`, `clearHeartbeat`, `close()`. Do **not** set `ws = null`.
- Then `clearReconnect`, reset attempt, `connectNow()`.
- `connectNow` still returns early when `isLiveSocket(ws)` — after `close()` the old socket is `CLOSING`, so a new `WebSocket` is assigned.
- Stale `onclose` still no-ops when `event.target !== ws`.
- No debounce timer.

## Risks

- Nulling `ws` after `close()` brings back the stale-`onclose` race plan 018 deleted. Do not.
- Treating `CLOSING` as live would make `connectNow` no-op after a key change.

## Implementation

### Files

- Change `src/musicweb/static/js/exclusive/companionClient.js`

### Steps

1. Next to `desiredConnectKey`, add `isLiveSocket(socket)` with a one-line comment: `close()` → `CLOSING`, so `connectNow` may assign a new socket.
2. `connectNow`: replace the inline `OPEN || CONNECTING` guard with `isLiveSocket(ws)`.
3. `syncCompanionConnection` after `wantConnected = true`:

```js
if (isLiveSocket(ws) && desired === inFlightKey) return;
if (isLiveSocket(ws)) {
  intentionalClose = true;
  clearHeartbeat();
  try { ws.close(); } catch { /* ignore */ }
}
clearReconnect();
reconnectAttempt = 0;
connectNow();
```

### Verify

- Grep the file: `WebSocket.OPEN` / `CONNECTING` appear only inside `isLiveSocket`.
- `uv run --group dev pytest`
- Inspection: different-key path does not assign `ws = null`. Same-key path does not call `close()`.

## Acceptance

- [ ] One live-socket predicate shared by sync and `connectNow`.
- [ ] Twin `OPEN`/`CONNECTING` blocks are gone.
- [ ] `ws` is not nulled on key change. No debounce timer.
