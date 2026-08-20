# Stage 01: Stay tuned across station advances

## Status
done

## Description

Stop treating end-of-file as Tune out. The listener stays a tuner and loads the next official snapshot. User-initiated pause still Tunes out.

## Rationale

This is the functional break: every natural advance currently requires Tune in again. The latch is local to radio audio and the store, so it can ship before the now-playing rewrite.

## Invariants

- `ended` is never Tune-out. Station clock owns advance.
- `pause` while `el.ended` does not invoke the Tune-out handler.
- User pause, headphone unplug, and lock-screen Pause still Tune out when the element is not ended and no load/seek is in flight.
- Track-change and lossy-flip while `tuning` / `tuned` still `loadCurrent`. `skip_pending` still stops audio and waits; it does not `tune_out`.
- `idle` while `tuning` / `tuned` still Tunes out.
- `radio.ts` does not import `player.ts`. Radio tests do not import `player.ts`.

## Risks

- Some engines fire `pause` before `ended`. The ignore must key off `el.ended` (or equivalent), not event order.
- A failed `loadCurrent` on the next id must not count as a hard failure (`countsAsFailure` stays false on advance). Do not trip the 3/10s cap on station advances.

## Implementation

### Files

- `frontend/src/radio/audio.ts`
- `frontend/tests/radio/audio.test.ts`
- `frontend/src/stores/radio.ts` (only if the `onPause` callback needs a second `ended` guard)
- `frontend/tests/stores/radio.test.ts`

### Steps

1. Extend the audio latch. Keep `shouldIgnoreTransport`. Add `shouldIgnorePause(loadInFlight, seekInFlight, ended)` that is true when transport is in flight **or** `ended` is true.
2. In `createRadioAudio`, the `pause` listener calls `shouldIgnorePause(..., el.ended)` and returns without `onPauseFn` when true. The `ended` listener is unchanged (still ignored only while load/seek is in flight).
3. Leave `audio.onEnded` in `tuneIn` as a no-op. Do not call `tuneOut` there. Do not send `tune_out`.
4. Confirm `onFaceOrTrack` already reloads on id change / lossy flip while `tuning` | `tuned`. Do not add a second `tune_in` on advance unless the profile changed (existing rule).
5. Optional belt: `onPause` in `radio.ts` no-ops when the element reports ended. Prefer the audio.ts latch as the source of truth so Media Session pause still Tunes out for a real pause.

### Verify

- `pnpm --dir frontend test` — `shouldIgnorePause` true when `ended` is true even if load/seek are false; false for a live pause. Existing in-flight cases still ignore. New store test: `chrome === "tuned"` + `applySnapshot` with a new current id leaves `chrome === "tuned"` (not `stopped`).
- `pnpm --dir frontend typecheck`

## Acceptance

- Natural end of a radio file does not send `tune_out` and does not set chrome to `stopped`.
- The next `current` snapshot loads `/api/stream` for the new id and returns to `tuned` without a user tap.
- A real pause while `tuned` (not ended) still Tunes out.
- Load/seek in flight still ignore pause and ended.
