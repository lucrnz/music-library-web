# Stage 04: Outbox and player

## Status
done

## Description

Persist fired listen events in `localStorage`, POST each one to `/api/listens` (flush owns retry; the POST is the probe), and feed the stage 03 accumulator through `listens/bridge.ts` from existing player sink hooks.

## Rationale

Downloaded and exclusive plays never become household stats unless the client reports them. A localStorage array matches playback position and avoids a third IndexedDB. Player wiring must stay a thin adapter so policy remains in `accumulator.ts` and `player.ts` does not grow another 70% / cycle blob.

## Invariants

- Key `musicweb.listens.pending.v1`. Value is a JSON array of `{ id, track_id, profile, play_source, counted_at }`.
- Write the array **before** POST. Quota or thrown `setItem`: drop the listen, do not POST, do not throw to the player.
- Two tabs: last write wins (same as playback position). No `storage` event merge.
- Flush mutex (`flushing`) so overlapping kicks do not stack loops.
- One POST per event: `postListen` uses `apiFetch` and returns `{ ok: true } | { status: number }`. Never `apiPost` (it `json()`s a 204).
- Delete the row on 204. Delete on 422. Keep on network / 5xx.
- Flush owns retry. Do not gate the POST on `canReachServer()`. Enqueue, `visibilitychange` (visible), and `initListens()` at boot always kick flush. `onConnectivityRecovered` is an extra kick only.
- On network / 5xx: keep the row, `reportFailure`, schedule local backoff (`BACKOFF_START_MS = 1000`, double, `BACKOFF_CAP_MS = 60000` — **copied numbers**, not imported from `connectivity.ts`). Do not add a `HealthWorkSource`.
- On 204: delete the row, reset backoff to 1s, **call** `reportSuccess()`.
- On 422: delete the row. Do not call `reportSuccess()`.
- `initListens` is a function in `flush.ts` (no `init.ts`). Call it from `main.ts` beside `initDiag`.
- Subscribe with `onConnectivityRecovered` from `frontend/src/connectivity.ts` as an extra kick. Do not `watch` the Vue connectivity store.
- Do not flush through the diagnostics outbox or `POST /api/diag/events`. Do not create `musicweb-listens` IDB. Do not copy `frontend/src/diag/idb.ts`.
- `frontend/src/listens/bridge.ts` exports `startCycle`, `onTime`, `onEnded`, `onRestart`, `discard`. It owns the current cycle. After `discard`, `onTime` / `onEnded` / `onRestart` are no-ops (`null`). `player.ts` only calls these. No 0.7 / 2s constants in `player.ts`.
- Hook table:

  | Player moment | Bridge call |
  |---|---|
  | After the **final** successful `attemptPlay` in `playHtml` (including downloaded→stream fallback) **and** after successful `playExclusive`, source is `streaming`/`downloaded`, profile is a non-empty string | `startCycle({ trackId, durationSec: track.duration, profile: player.playProfileId, playSource: player.playSource })` |
  | `beginLoad` / `stopPlayback` | `discard()` |
  | `onSinkTime` (after `if (player.seeking) return`) | `onTime({ currentTime: t, duration: d, playing: !activeSink.paused })`; if event, enqueue. See pending-resume note below. |
  | `onSinkEnded` | `onEnded()` then enqueue if event; if repeat-one, after seek-0, `onRestart()` |
  | `playPrev` when `currentTime > 3` (seek 0, existing 3s rule) | `onRestart()` only |

- `onSinkTime` already **returns** after `flushPendingResume()`. Call `onTime` either **before** that return (the pre-seek sample is a first sample or a seek jump; both add nothing) or skip that tick and let the next `timeupdate` after the seek be the first `onTime`. Both are correct. Do **not** add a resume branch in `player.ts` or `accumulator.ts`.
- Do not start a cycle from `player.load.ok` (html-only emit). Exclusive never emits it.
- Tests cover read/write/drop-on-throw and flush classification with a Map-backed `localStorage` (already in the node harness) and mocked `postListen`. They must not import `player.ts`.

## Risks

- Creating the cycle before source is known would record `playSource: "none"`. Start only after a successful load.
- Two tabs can play at once and both count (LAN personal app; accepted).
- Clock skew: stage 02 rejects `counted_at` > now+5m; the outbox must drop that 422 so it cannot stick forever.

## Implementation

### Files

- Create: `frontend/src/listens/outbox.ts` (read/write/remove-by-id; ignore thrown storage)
- Create: `frontend/src/listens/flush.ts` (enqueue + mutex flush + local backoff + `initListens`)
- Create: `frontend/src/listens/bridge.ts`
- Change: `frontend/src/api.ts` (`postListen` via `apiFetch` only)
- Change: `frontend/src/stores/player.ts` (call sites only; see hook table)
- Change: `frontend/src/main.ts` (`initListens()`)
- Create: `frontend/tests/listens/outbox.test.ts`
- Create: `frontend/tests/listens/flush.test.ts`

### Steps

1. Outbox helpers: parse the JSON array; invalid/missing → `[]`. `enqueue` appends and `setItem`. `remove(id)` filters. Thrown storage → no-op (enqueue returns false).
2. `enqueueListen(event)` maps accumulator fields to API names, writes, then kicks flush only if the write succeeded (even if `canReachServer()` is false).
3. `flushListens()`: if `flushing`, return. Do **not** return because `!canReachServer()`. Loop pending ids sequentially. Network/5xx → `reportFailure` + schedule backoff. 204 → **must** `reportSuccess()`, reset backoff. 422 → delete, no `reportSuccess`.
4. `initListens()` in `flush.ts`: boot kick, `visibilitychange` when visible, `onConnectivityRecovered` extra.
5. Bridge: one module-level cycle. `startCycle` discards any previous cycle first. `discard` on `beginLoad` (after `playGen` increments) so a failed load cannot fire.
6. Player: wire the hook table. Repeat-one: `onEnded` then seek 0 then `onRestart`. `playPrev` restart: `onRestart` after seek 0.
7. Tests: write → read; thrown `setItem` → enqueue false and no POST; flush first 204, second 422, third network fail → two deleted, one remains; mutex does not overlap; after a network fail, a later kick (simulated timer) POSTs again; flush runs even when a mocked `canReachServer()` is false.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manual (not automated, not acceptance): play a short track past 70% online and confirm a row; play offline then reconnect and confirm the flush.

## Acceptance

- [ ] Automated: outbox key/shape, thrown-storage drop, 204 deletes + `reportSuccess`, 422 deletes without `reportSuccess`, network keep + backoff retry, flush mutex, POST attempted when `canReachServer()` is false. No `player.ts` import in those tests.
- [ ] `postListen` uses `apiFetch` and does not call `apiPost`.
- [ ] `player.ts` contains no 0.7 / 2s constants and no cycle variable; those live in `accumulator.ts` / `bridge.ts`.
- [ ] Exclusive success starts a cycle; `player.load.ok` is not the start hook.
- [ ] `onSinkTime` calls `onTime` without a resume special case (before the `pendingResume` return, or on a later tick after the seek).
- [ ] `playPrev` seek-0 calls `onRestart` only.
- [ ] Diagnostics IDB, downloads IDB, and `HealthWorkSource` are untouched.
