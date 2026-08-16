> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Exclusive identity cleanup

## Goal

Close the four structural holes the thermo-nuclear review found in the uncommitted plan-018 exclusive-correctness work. Behavior stays the same for the happy path. The hub’s “current session” rule becomes a locked invariant, and the leftover extract copies in the client go away.

## Settled decisions

- **Scope:** only those four review blockers. No `beginLoad` companion stop. No drive-by delete of `applyResolvedSource`’s unused `"exclusive"` type.
- **Hub gate:** `handle_message` must not peek identity unlocked and then mutate mpv.
- **Predicates (call only under `_lock`):**
  - `_is_current(sess)` → `_clients.get(sess.session_id) is sess`
  - `_is_live_controller(sess)` → current **and** `role == controller` **and** `_controller_id == sess.session_id` (fail closed if role and controller id disagree)
- **Who uses which:** heartbeat and `LIST_DEVICES` need `_is_current` only. Playback commands (`SET_DEVICE`, `LOAD`/`PLAY`, `PAUSE`, `RESUME`, `STOP`, `SEEK`, `SET_VOLUME`) need `_is_live_controller`.
- **When:** live-controller check **before** `to_thread` and **again after**, before any hub field write or broadcast. Do not hold `_lock` across `to_thread` or `broadcast()` (`broadcast` takes `_lock` — that deadlocks).
- **`SET_DEVICE`:** do not assign `_device_id` until `set_device` succeeds **and** the after-check still passes.
- **Stale in-flight work:** a `to_thread` that already started may still hit mpv. Do **not** `STOP` it (that can kill the new controller’s load). After-check simply skips hub writes / broadcast.
- **Helpers:** file-local `_is_current` / `_is_live_controller` only. No `_run_if_controller` wrapper that hides the lock.
- **Tests:** keep the existing post-replace `handle_message` test. Add TTL-then-`LOAD` (before-check → `load_calls == []`). Add mid-flight replace with a `threading.Event` gate on `FakePlayer.load` / `set_device` only — never on `release_device`. Mid-flight asserts hub identity/fields; do **not** assert `load_calls == []`.
- **`togglePlay`:** if the sink is not paused → `pause()`; else `ensureAudible()`; then `syncTransportFlags()`. Do **not** gate on `playSource` (after `beginLoad`, source is `none` while companion may still be playing). Delete the leftover `pl.length` / `index < 0` copies.
- **`syncCompanionConnection`:** one live-socket branch plus `isLiveSocket` (`OPEN` or `CONNECTING`). Live + same key → return. Live → close. Then `connectNow()`. Comment that `close()` is `CLOSING`, so `connectNow`’s live-socket guard does not no-op. Do not null `ws` after close. No debounce timer.
- **`exclusiveAudio.js`:** one file-local `companion(fn)` for the dynamic import. `setHogToken` / `commitHogToken` stay two functions.

## Design

Plan 018 made disconnect identity-based and extracted `playExclusive` / `playHtml`. It left `handle_message` as an unlocked peek, and it left the old `togglePlay` / twin sync predicates / five identical `import()` sites.

**Hub.** The current socket is `_clients[id] is sess`. A live controller is that plus role and `_controller_id`. TTL demotion keeps the same `ClientSession` and only flips role / clears `_controller_id`, so identity-alone still lets an in-flight `LOAD` through — hence fail-closed `_is_live_controller`. Gate under the lock, drop the lock for player work, gate again before `_device_id` or `broadcast`. `handle_disconnect` should use `_is_current` (same predicate, already under the lock).

**Client leftovers.** `ensureAudible` already owns empty queue, `index < 0`, and retry-when-not-live. Toggle is pause vs that. Socket liveness is one helper so `syncCompanionConnection` and `connectNow` share the `CLOSING` contract. The companion module loader is one helper so enable / token / port / device do not each spell `import().then().catch()`.

## Stage map

1. **Hub gate + tests** — this is the leak. Client leftovers do not depend on it, but the review fails until the invariant is closed and tested.
2. **`togglePlay`** — independent extract leftover. First because it is the smallest player change and sits on the transport hot path.
3. **`isLiveSocket`** — independent. After toggle so player.js is not in two stages.
4. **`companion(fn)`** — independent store cleanup. Last; no behavior change.

## Out of scope

- Stopping the companion from `beginLoad`.
- Deleting `applyResolvedSource`’s unused `"exclusive"` type.
- A controller command queue or load epoch beyond the locked before/after gate.
- Holding `_lock` for all of `handle_message`.
- Nulling `ws` after `close()`.
- A debounce timer on companion sync.
- Any lossy-index / plan 019 work.
- Rewriting plan 018 in place.

## Assumptions

- The uncommitted plan-018 tree is the baseline this plan edits.
- `asyncio.Lock` is not re-entrant; `broadcast()` acquires `_lock`.
- `FakePlayer` methods run inside `asyncio.to_thread`, so a mid-flight block must be a `threading.Event`.
- No JS test runner; stages 02–04 are verified by reading the folded control flow and a manual exclusive pass if a Mac companion is available.
- Frontend exclusive verification is optional when the companion is not running; hub tests are mandatory.
