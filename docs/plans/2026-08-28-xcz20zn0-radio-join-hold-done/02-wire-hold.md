# Stage 02: Wire the hold

## Status
done

## Description

After load → seek → `play()` succeeds, start the 8 s hold while chrome is already `tuned`. Pause or error during the hold stays in session and `schedule`s rejoin. Official `ended` and allowed Tune-outs cancel the hold. After the hold completes, pause Tunes out again.

## Rationale

This is the user-visible fix. Stage 01 is only the latch; without this wiring a sub-second `pause` still calls `tuneOut()`.

## Invariants

- See [context/design.md](context/design.md) for who may Tune out and what the hold means.
- One module-level `createJoinHold()` in `frontend/src/radio/session.ts`. Export `cancelRadioJoinHold()` that calls `cancel()`.
- `start()` only on the existing successful load → seek → `play()` path, after `radio.chrome = "tuned"` and `cancelRadioRejoin()`, and only when `gen === radioGen`.
- `cancel()` whenever this play is no longer the live join: start of `loadCurrent`, `clearLoadedKeys`, `onError`, the failed-hold path, official `ended`. `tuneOut`, `leaveRadio`, and `resetRadioStore` call `cancelRadioJoinHold()` **before** `audio.stop()` (`stopHtmlAudio` fires `pause()`). Catch-up / skip-pending / connectivity loss go through `clearLoadedKeys`.
- HTML `onPause` and Media Session `pause` share one function: if chrome is not `tuned` or the element `ended`, return; if `joinHold.pending`, set `chrome = "tuning"` and `scheduleRadioRejoin()` (do not `tuneOut()`, do not toast); else `tuneOut()`.
- `shouldIgnorePause` still drops load/seek/`ended` before that function.
- Media Session **stop**, the Tune-out tap, idle, and `leaveRadio` still leave immediately.
- Do not add a chrome value. Do not `kick` on a failed hold. Do not start the listen cycle later than today.

## Risks

- A real lock-screen pause in the first 8 s retries instead of Tuning out. Accepted: the tap Tune-out control still leaves, and after 8 s pause is Tune-out again.
- `clearLoadedKeys` now cancels the hold. That is intended (every current caller is tearing down the live play).

## Implementation

### Files

- `frontend/src/radio/session.ts`
- `frontend/src/stores/radio.ts`
- `frontend/tests/radio/session.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/radio/session.ts`, import `createJoinHold` from `@/radio/hold`. Construct one module-level clock. Export `cancelRadioJoinHold()` as `joinHold.cancel`. Call `cancelRadioJoinHold()` at the top of `clearLoadedKeys` and at the start of `loadCurrent` (before `discardListen` / `++radioGen`).
2. In `frontend/src/radio/session.ts` `loadResolvedRadio`, on the existing success path (`radio.chrome = "tuned"` then `cancelRadioRejoin()`), call `joinHold.start()`. Do not move the listen-cycle `startCycle` call.
3. In `frontend/src/radio/session.ts`, extract the HTML `onPause` body and the Media Session `pause` handler into one function (for example `pauseWhileTuned`) used by both. Implement the Invariants branch (`pending` → `tuning` + `scheduleRadioRejoin()`; else `tuneOut()`). Keep Media Session **stop** on `tuneOut()`.
4. In `frontend/src/radio/session.ts` `bindAudioHandlers` `onError`, call `cancelRadioJoinHold()` before `scheduleRadioRejoin()`. In `onEnded`, call `cancelRadioJoinHold()` (do not `schedule`, do not `tuneOut()`).
5. In `frontend/src/stores/radio.ts`, import `cancelRadioJoinHold` from `frontend/src/radio/session.ts` next to the existing session imports. Call it at the top of `tuneOut`, `leaveRadio`, and `resetRadioStore` **before** `audio.stop()`. Do not rely on `clearLoadedKeys` for those three paths (`stopHtmlAudio` emits `pause` first).
6. In `frontend/tests/radio/session.test.ts`, keep using fake timers and restore them in `afterEach` (already present). Add: successful `loadCurrent` leaves chrome `tuned` immediately and a pause dispatched before 8 s leaves chrome `tuning` (not `stopped`) and does not toast; after advancing `RADIO_JOIN_HOLD_MS`, a pause Tunes out (`stopped`); official `ended` during the hold (set the element `ended` / dispatch `ended`, then `pause`) does not Tune out and does not `schedule` a retry; a second `loadCurrent` before 8 s cancels the first hold (pause after the second `play()`, before another 8 s, retries rather than Tuning out). Call `bindAudioHandlers()` (or `onFaceOrTrack`) so the pause listener is attached. Import `RADIO_JOIN_HOLD_MS` from `@/radio/hold`.
7. In `frontend/tests/radio/session.test.ts`, extend the existing failed-load retry case only if chrome timing changes; existing `chrome === "tuned"` after a successful play stays valid (hold does not delay `tuned`).
8. In `frontend/tests/stores/radio.test.ts`, add: `tuneOut` after a successful `loadCurrent` cancels the hold (fake timers: advance `RADIO_JOIN_HOLD_MS` after `tuneOut` and assert chrome stays `stopped` and `load` is not called again). `resetRadioStore` already cancels rejoin; keep that test and confirm it still compiles with the new `cancelRadioJoinHold` import.

### Verify

```sh
pnpm --dir frontend test tests/radio/hold.test.ts tests/radio/session.test.ts tests/stores/radio.test.ts
pnpm --dir frontend typecheck
```

If a radio station is reachable: Tune in, confirm chrome is `tuned` and audio plays immediately; if a join glitches in the first 8 s, chrome stays `tuning` and audio comes back without a Tune-in tap. After 8 s of play, lock-screen or element pause Tunes out. Tap Tune out during the first 8 s still leaves immediately. Wait for an official track change and confirm the next join is also held (pause in the first 8 s of the new track retries).

## Acceptance

- `play()` success is `tuned` immediately. The join is not pause-safe until 8 s of uninterrupted play.
- Pause or error before 8 s: chrome `tuning`, rejoin `schedule`d, not `stopped`.
- Pause after 8 s: Tune out.
- Official `ended` during the hold does not Tune out and does not retry that load.
- Tune-out tap, Media Session **stop**, idle, and `leaveRadio` still leave immediately.
- Listen cycle still starts on the first successful `play()`, not after the hold.
