# Stage 01: Extract shared join clocks

## Status
done

## Description

Move radio’s join-hold clock, rejoin backoff clock, and 8 s load-timeout constant into `frontend/src/playback/` so queue and radio import the same machines. Radio call sites and tests retarget. Radio product behavior does not change.

## Rationale

Stage 02 cannot implement “the same loop as radio” while the clocks live under `radio/` (`player.ts` must not import `radio.ts`). Extracting first makes 02 a wiring change, not a second copy of the timers.

## Invariants

- `JOIN_HOLD_MS`, `REJOIN_INITIAL_MS`, `REJOIN_CAP_MS`, and `JOIN_LOAD_TIMEOUT_MS` are 8000 / 1000 / 8000 / 8000.
- `createJoinHold` and `createRejoinClock` keep the current semantics (hold reset on `start`, no expiry callback; rejoin `schedule` coalesces, `kick` resets delay, `cancel` clears backoff).
- Radio session, store, and audio still use those machines; Tune-in / hold / rejoin outcomes stay as they are today.
- `player.ts` still does not import `radio.ts` or anything under `frontend/src/radio/`.

## Risks

- Missed import of `@/radio/hold` or `@/radio/rejoin` leaves a broken module after delete.
- Renaming `RADIO_*` constants in radio tests without updating every `advanceTimersByTimeAsync` call.

## Implementation

### Files

- `frontend/src/playback/`
- `frontend/src/playback/joinHold.ts`
- `frontend/src/playback/rejoinClock.ts`
- `frontend/src/playback/joinTimeout.ts`
- `frontend/src/playback/sinks/htmlElement.ts`
- `frontend/tests/playback/`
- `frontend/src/radio/hold.ts`
- `frontend/src/radio/rejoin.ts`
- `frontend/src/radio/session.ts`
- `frontend/src/radio/audio.ts`
- `frontend/src/stores/radio.ts`
- `frontend/tests/playback/joinHold.test.ts`
- `frontend/tests/playback/rejoinClock.test.ts`
- `frontend/tests/radio/hold.test.ts`
- `frontend/tests/radio/rejoin.test.ts`
- `frontend/tests/radio/audio.test.ts`
- `frontend/tests/radio/session.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. Add `frontend/src/playback/joinHold.ts`: export `JOIN_HOLD_MS = 8000` and `createJoinHold()` with the same body as today’s `frontend/src/radio/hold.ts` (timer + `pending` / `start` / `cancel`), keyed off `JOIN_HOLD_MS`.
2. Add `frontend/src/playback/rejoinClock.ts`: export `REJOIN_INITIAL_MS = 1000`, `REJOIN_CAP_MS = 8000`, `nextRejoinDelay`, and `createRejoinClock` with the same body as today’s `frontend/src/radio/rejoin.ts`.
3. Add `frontend/src/playback/joinTimeout.ts`: export `JOIN_LOAD_TIMEOUT_MS = 8000` only.
4. In `frontend/src/playback/sinks/htmlElement.ts`, add `waitAudioEventWithTimeout(el, name, timeoutMs)` that races existing `waitAudioEvent` against a reject `Error("audio canplay timeout")` and always clears the timer. Do not change `waitAudioEvent`’s signature.
5. Point `frontend/src/radio/session.ts` at `createJoinHold` from `@/playback/joinHold`. Point `frontend/src/stores/radio.ts` at `createRejoinClock` from `@/playback/rejoinClock`.
6. In `frontend/src/radio/audio.ts`, delete `RADIO_LOAD_TIMEOUT_MS`. HTML `load` uses `waitAudioEventWithTimeout(el, "canplay", JOIN_LOAD_TIMEOUT_MS)`. Companion duration wait uses `JOIN_LOAD_TIMEOUT_MS` for the same `"audio canplay timeout"` reject.
7. Delete `frontend/src/radio/hold.ts` and `frontend/src/radio/rejoin.ts`. Do not leave re-export shims.
8. Move `frontend/tests/radio/hold.test.ts` to `frontend/tests/playback/joinHold.test.ts` (import `@/playback/joinHold`, assert `JOIN_HOLD_MS`). Move `frontend/tests/radio/rejoin.test.ts` to `frontend/tests/playback/rejoinClock.test.ts` (import `@/playback/rejoinClock`).
9. Update `frontend/tests/radio/session.test.ts` and `frontend/tests/stores/radio.test.ts` to import `JOIN_HOLD_MS` from `@/playback/joinHold`. Update `frontend/tests/radio/audio.test.ts` to import `JOIN_LOAD_TIMEOUT_MS` from `@/playback/joinTimeout` and keep the canplay / duration timeout cases.

### Verify

- `rg "radio/hold|radio/rejoin|RADIO_JOIN_HOLD_MS|RADIO_REJOIN_|RADIO_LOAD_TIMEOUT_MS" frontend` is empty.
- `pnpm --dir frontend test -- frontend/tests/playback/joinHold.test.ts frontend/tests/playback/rejoinClock.test.ts frontend/tests/radio frontend/tests/stores/radio.test.ts` passes.

## Acceptance

- Radio hold, rejoin, session, audio, and store tests pass with the shared modules.
- No remaining imports of `@/radio/hold` or `@/radio/rejoin`.
- Queue load / pause / fail behavior is unchanged in this stage.
