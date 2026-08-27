# Stage 01: Lower listen threshold

## Status
done

## Description

Change `LISTEN_THRESHOLD` from `0.7` to `0.65` and retarget the accumulator tests that pin 70% / a 70-second fire point.

## Rationale

The cycle, outbox, and sinks already read this constant. Updating it (and the tests that would fail) is the whole product change.

## Invariants

- Fire when `listenedSec >= LISTEN_THRESHOLD * duration` (keep the existing `<` guard).
- Still one fire per cycle. `onRestart` still resets and allows a second event.
- Pause, seek larger than 2s, seek-back, and the first sample still add no time.
- Known duration still makes `onEnded` a no-op; unknown duration still fires only on `onEnded`.
- `playSource` / `origin` gating is unchanged.

## Risks

- Leaving a test or comment that still says 70% while asserting 65% would hide a later drift.

## Implementation

### Files

- `frontend/src/listens/accumulator.ts`
- `frontend/tests/listens/accumulator.test.ts`

### Steps

1. In `frontend/src/listens/accumulator.ts`, set `LISTEN_THRESHOLD` to `0.65`. Change the file comment from “Pure 70% play-cycle rules” to “Pure 65% play-cycle rules”. Do not touch `LISTEN_SEEK_EPSILON_SECONDS` or the `maybeThreshold` comparison shape.
2. In `frontend/tests/listens/accumulator.test.ts`, expect `LISTEN_THRESHOLD` to be `0.65`.
3. In the same file, rename the two test titles that say “70%” so they say “65%”.
4. In “fires once after 65% of playing samples and not again” (`durationSec: 100`): assert `play(c, 0, 64)` is null, fire on `play(c, 64.5, 65)`, then assert `play(c, 65.5, 80)` and `onEnded()` stay null.
5. Leave the 10-second helpers that play to 7.5s (already above 6.5s) and the below-threshold `onEnded` case that plays 5s of 10s (still below 6.5s). Do not add new cases that sit between 6.5s and 7.0s unless a current assertion would fail.

### Verify

```sh
pnpm --dir frontend test -- tests/listens/accumulator.test.ts
```

Confirm no other production file under `frontend/src/` still hardcodes `0.7` as the listen bar:

```sh
rg -n "LISTEN_THRESHOLD|0\\.7|70%" frontend/src/listens frontend/tests/listens
```

## Acceptance

- `LISTEN_THRESHOLD === 0.65`.
- A 100-second cycle does not fire at 64s of playing samples and does fire by 65s, once.
- A 10-second cycle that has only 5s of playing samples still does not fire on `onEnded`.
- `pnpm --dir frontend test -- tests/listens/accumulator.test.ts` passes.
