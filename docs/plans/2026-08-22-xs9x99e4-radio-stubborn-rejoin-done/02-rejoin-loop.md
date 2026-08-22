# Stage 02: Rejoin loop

## Status
done

## Description

While chrome is `tuning` and the station face is `current`, keep joining: `sendTuneIn` on an open socket, then `loadCurrent`, until `play()` succeeds. Bound each radio `load` to 8 s. Back off 1 s → 2 s → 4 s → 8 s after a failed attempt. Kick immediately (reset delay) on a snapshot that needs a load, socket reconnect, connectivity `online`, and user Tune-in. Connectivity loss and a failed first `tune_in` stay in `tuning` and do not toast.

## Rationale

Stage 01 stops the false Tune-out but leaves a dead `tuning` face after a missed `canplay`, a dropped socket, or a connectivity blip. This stage is the “more stubborn” join.

## Invariants

- See [context/design.md](context/design.md) for who may call `tuneOut()` and for silent retries.
- The rejoin clock never calls `tuneOut()`.
- `schedule` is a no-op if an attempt is in flight or a timer is already pending. `kick` clears the timer, sets last delay to `null`, and runs now.
- `cancel` on `tuneOut`, `leaveRadio`, `resetRadioStore`, station idle (via `tuneOut`), and after a successful load → seek → play (`chrome = "tuned"`).
- Do not `schedule` while `face` is `catching_up`, `skip_pending`, or `idle`, or while chrome is `inactive` / `stopped` / `tuned`.
- `sendTuneIn` runs at the start of an attempt only when `radio.connected` is true. If it returns false, `schedule` (do not set `stopped`, do not toast).
- If `!radio.connected`, `schedule` and let `runtime.ts` reconnect; `onRadioSocketReconnect` `kick`s.
- Radio `load()` rejects after 8 s if `canplay` has not fired. Shared `waitAudioEvent` in `htmlElement.ts` is unchanged.
- Connectivity `!== "online"` while `tuning` / `tuned`: set `tuning`, stop audio, `clearLoadedKeys`, `bumpRadioGen`, do **not** `tuneOut()`, do **not** toast. When state becomes `online` and chrome is `tuning`, `kick`.
- User `tuneIn()`: on `sendTuneIn` false, stay `tuning` and `schedule`. No “Could not tune in” toast. Idle still toasts “Radio is not on air yet” and stays `stopped`.

## Risks

- Re-sending `tune_in` on every retry can refresh household prepare. That is accepted (same codec, same connection).
- An 8 s load bound can abort a slow first byte on a cold encode; the next attempt continues. Do not raise the bound in this stage.
- Two kicks in one tick (snapshot + reconnect) must not start overlapping `loadCurrent`s; `radioGen` already cancels the loser.

## Implementation

### Files

- `frontend/src/radio/rejoin.ts`
- `frontend/tests/radio/rejoin.test.ts`
- `frontend/src/radio/session.ts`
- `frontend/src/radio/audio.ts`
- `frontend/src/stores/radio.ts`
- `frontend/tests/radio/session.test.ts`
- `frontend/tests/radio/audio.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. Create `frontend/src/radio/rejoin.ts` exporting `RADIO_REJOIN_INITIAL_MS = 1000`, `RADIO_REJOIN_CAP_MS = 8000`, `nextRejoinDelay(prevMs: number | null): number` (`null` → 1000, else `min(prev * 2, 8000)`), and `createRejoinClock(attempt: () => Promise<void>)` with `kick()`, `schedule()`, and `cancel()` as in Invariants. Use `setTimeout` / `clearTimeout`. `attempt` rejections must not throw out of the clock (`try/finally` around `inFlight`).
2. Create `frontend/tests/radio/rejoin.test.ts`: `nextRejoinDelay` sequence 1000, 2000, 4000, 8000, 8000; `schedule` after a rejected `attempt` is the caller’s job — test that two `schedule()` calls before the timer fires create one timer; `kick` runs `attempt` immediately and a later `schedule` uses 1000 again; `cancel` prevents a pending `schedule` from running; a second `kick` while `attempt` is in flight does not start a second `attempt`.
3. In `frontend/src/radio/audio.ts` `load()`, race `waitAudioEvent(el, "canplay")` with an 8 s timeout that rejects (clear the timer in `finally`). Keep `loadInFlight` cleared in `finally`. Do not change the shared queue `waitAudioEvent` helper.
4. In `frontend/tests/radio/audio.test.ts`, add a fake-timers case: `vi.useFakeTimers()`, `createRadioAudio().load` with a src that will not fire `canplay` (empty string), advance 8 s, expect the promise to reject and `loadInFlight === false`. Restore real timers in `afterEach`.
5. In `frontend/src/stores/radio.ts`, construct one module-level `createRejoinClock` (import from `frontend/src/radio/rejoin.ts`). `attempt` is: if chrome is not `tuning`, return; if `radio.connected`, `await sendTuneIn()` and on false `schedule` + return; if `!radio.connected`, `schedule` + return; if `face !== "current"` or no `radio.track?.id`, return (do not `schedule`); else `await loadCurrent()`. Export `kickRadioRejoin`, `scheduleRadioRejoin`, and `cancelRadioRejoin` that delegate to that clock. Keep `sendTuneIn` imported from the runtime module as it already is. Do not import the runtime module from `frontend/src/radio/session.ts`.
6. In `frontend/src/radio/session.ts`, replace the `failTuneIn` no-op with `scheduleRadioRejoin()` (import from `frontend/src/stores/radio.ts` next to `tuneOut`). Remove the `countsAsFailure` parameter from `failTuneIn`, `loadResolvedRadio`, `loadCurrent`, and `onFaceOrTrack` (update every call site in those two files). `onError` in `bindAudioHandlers`: if chrome is `tuning` or `tuned`, set `chrome = "tuning"` if needed and `scheduleRadioRejoin()`. After successful load → seek → play (the existing `radio.chrome = "tuned"` line), `cancelRadioRejoin()`. In `onFaceOrTrack`, when chrome is `tuning` / `tuned` and `changed`, keep awaiting `loadCurrent()` directly (that call is the in-flight attempt — do not `kick`). When catch-up / skip-pending stop audio, `cancelRadioRejoin()` so the clock does not hammer a missing track; the next `current` snapshot will `loadCurrent` again.
7. In `frontend/src/stores/radio.ts` `tuneOut`, `leaveRadio`, and `resetRadioStore`, call `cancelRadioRejoin()`. In `tuneIn`, on `sendTuneIn` false: keep `chrome = "tuning"`, `scheduleRadioRejoin()`, do not toast “Could not tune in”, do not set `stopped`. Still toast “Radio is not on air yet” and return when face is not `current`. Change `onFaceOrTrack(null, true)` to `onFaceOrTrack(null)` after the parameter is removed. In `onRadioSocketReconnect`, on `sendTuneIn` false do not `return` with no follow-up: `scheduleRadioRejoin()`; on success, keep `await onFaceOrTrack(null)`.
8. In `frontend/src/stores/radio.ts` `bindConnectivity`, on `state !== "online"` and chrome `tuning` / `tuned`: set `tuning`, `audio.stop()`, `clearLoadedKeys()`, `bumpRadioGen()`, do not `tuneOut()`, do not toast. On `state === "online"` and chrome `tuning`, `kickRadioRejoin()`.
9. In `frontend/tests/radio/session.test.ts` and `frontend/tests/stores/radio.test.ts`, drop the second `countsAsFailure` argument at all call sites. Add tests: failed `loadCurrent` while `tuning` leaves chrome `tuning` and a subsequent mocked success path (invoke the clock’s next attempt, using fake timers for 1 s) reaches `tuned`; `tuneIn` with `sendTuneIn` false (mock `sendTuneIn` or the socket) stays `tuning` not `stopped` and does not toast “Could not tune in”; connectivity `offline` while `tuned` becomes `tuning` not `stopped` and does not toast “Connection lost — tuned out”; `tuneOut` / `resetRadioStore` cancel a pending timer (fake timers: advance 1 s after `tuneOut` and assert `load` is not called again).

### Verify

```sh
pnpm --dir frontend test tests/radio/rejoin.test.ts tests/radio/session.test.ts tests/radio/audio.test.ts tests/stores/radio.test.ts
pnpm --dir frontend typecheck
```

If a radio station is reachable, Tune in, wait for the official track to change (or trigger a debug skip), and confirm chrome stays in session and audio joins the next track without a Tune-out toast. Toggle connectivity or block `/api/stream` briefly and confirm it rejoins without going `stopped`.

## Acceptance

- A failed join while the user still wants radio leaves chrome at `tuning` and retries at 1 s, 2 s, 4 s, then 8 s, until `play()` succeeds or an allowed Tune-out runs.
- Snapshot / reconnect / back-online start an attempt immediately rather than waiting out the current backoff.
- Radio `load()` cannot hang past 8 s. Queue `waitAudioEvent` is untouched.
- Connectivity loss and a failed `tune_in` ack do not Tune out and do not toast.
- Idle Tune-in still toasts “Radio is not on air yet” and stays `stopped`.
