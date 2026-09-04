# Stage 02: Rejoin kick waits 250ms

## Status
done

## Description

Keep the 1s → 2s → 4s → 8s rejoin clock. Change `kick()` so the first attempt waits at least 250ms instead of running in the same turn. Radio and on-demand share this module, so both get the floor.

## Rationale

Connectivity recovery calls `kick()`. On Chrome Android that can flap, which reloads the element immediately and stutters. `schedule()` is already ≥ 1s; only the instant path needs a floor.

## Invariants

- `REJOIN_INITIAL_MS` stays 1000; `REJOIN_CAP_MS` stays 8000; `nextRejoinDelay(null)` stays 1000.
- `schedule()` coalescing, in-flight single-flight, and `cancel()` clearing backoff stay as they are.
- `kick()` still resets backoff so the next `schedule()` after a failed kick is 1s, not 250ms.
- `JOIN_HOLD_MS` is unchanged.

## Risks

- Tests that `await Promise.resolve()` after `kick()` and expect an attempt must advance 250ms of fake timers.
- A second `kick()` while the 250ms timer is armed must not stack two attempts (clear and re-arm, or ignore if already armed — pick one and lock it in the test; recommended: clear and re-arm 250ms, still one attempt).

## Implementation

### Files

- `frontend/src/playback/rejoinClock.ts`
- `frontend/tests/playback/rejoinClock.test.ts`
- `frontend/tests/playback/queueJoin.test.ts`

### Steps

1. In `frontend/src/playback/rejoinClock.ts`, export `REJOIN_MIN_MS = 250`. `kick()` clears any timer, sets `lastDelay = null`, and `setTimeout`s `run()` after `REJOIN_MIN_MS`. Do not assign `lastDelay = 250` (that would make the next `schedule()` start at 500).
2. If `kick()` is called while `inFlight`, keep today’s single-flight (`run` no-ops); do not queue a zero-delay follow-up. If `kick()` is called while the min timer is pending, clear and re-arm 250ms.
3. Rewrite `frontend/tests/playback/rejoinClock.test.ts` “kick runs immediately”: after `kick()`, `attempt` is not called until `advanceTimersByTimeAsync(249)` still 0 and `250` is 1. Keep “kick resets backoff” so the following `schedule()` still waits 1000ms, not 250. Keep the in-flight second-kick test (still one attempt).
4. In `frontend/tests/playback/queueJoin.test.ts`, if any case calls `kick()`, advance 250ms before expecting `attempt`. Do not change the 1s/2s/4s/8s `onFailedJoin` table test.

### Verify

- `pnpm --dir frontend test -- frontend/tests/playback/rejoinClock.test.ts frontend/tests/playback/queueJoin.test.ts` passes.
- `rg -n "void run\\(\\)" frontend/src/playback/rejoinClock.ts` is empty inside `kick` (kick must go through the min timer).

## Acceptance

- `kick()` does not invoke `attempt` before 250ms.
- After a kicked attempt fails, `schedule()` still waits 1s, then 2s / 4s / 8s.
- Radio keeps compiling against `createRejoinClock` with no call-site change.
