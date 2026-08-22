# Stage 01: Stay in session

## Status
done

## Description

Stop the client from Tuning out on an official track change, a load/play failure, or an HTML/Media Session `pause` that happens while chrome is no longer `tuned`. Drop chrome to `tuning` before any reload `await`. Delete the 3-in-10s failure cap. Idle, user Tune out, Media Session stop, and pause-while-`tuned` stay as they are.

## Rationale

The auto-tune-out on track change is a false user gesture: chrome stays `tuned` across the src swap, so a late `pause`/`error` calls `tuneOut()`. Until that latch is gone, a rejoin loop cannot keep the listener.

## Invariants

- `tuneOut()` still sends `tune_out`, stops audio, clears loaded keys, bumps `radioGen`, and sets chrome `stopped`.
- Station `idle` while `tuning` / `tuned` still calls `tuneOut()`.
- HTML `pause` Tunes out only when `radio.chrome === "tuned"` and the element has not `ended` (existing `shouldIgnorePause` still ignores load/seek in flight).
- Media Session `pause` Tunes out only when chrome is `tuned`, the element has not `ended`, and load/seek is not in flight. Media Session `stop` still Tunes out.
- Official-id change, lossy-flag change, or `prevId` mismatch while `tuning` / `tuned` sets `chrome = "tuning"` **before** `await loadCurrent(...)`.
- `loadCurrent` itself sets `chrome = "tuning"` when chrome is `tuned` before any `await`.
- `failTuneIn` and `radioAudio.onError` do not call `tuneOut()` and do not toast.
- `countsAsFailure` may remain on the `loadCurrent` / `onFaceOrTrack` signatures; it must not affect Tune-out.
- `frontend/src/radio/failures.ts` is gone. Nothing imports `createFailureCap` or `radioFailures`.
- Catch-up / skip-pending still drop `tuned` → `tuning`, stop audio, clear keys, bump gen, and do not Tune out.
- Connectivity loss still Tunes out in this stage (stage 02 replaces that).

## Risks

- After a failed swap this stage can leave chrome at `tuning` with no audio until the next snapshot or a manual Tune out / Tune in. Stage 02 adds the retry clock.
- The store test that expects chrome to remain `tuned` across an id change will fail until it asserts “not `stopped`” (typically `tuning` until a mocked load finishes).

## Implementation

### Files

- `frontend/src/radio/session.ts`
- `frontend/src/stores/radio.ts`
- `frontend/src/radio/failures.ts`
- `frontend/tests/radio/failures.test.ts`
- `frontend/tests/radio/session.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/radio/session.ts` `onFaceOrTrack`, when `(radio.chrome === "tuning" || radio.chrome === "tuned") && changed`, assign `radio.chrome = "tuning"` then `await loadCurrent(countsAsFailure)`. Do not await first.
2. In `frontend/src/radio/session.ts` `loadCurrent`, if `radio.chrome === "tuned"`, set `radio.chrome = "tuning"` before `discardListen` / `++radioGen` / `loadResolvedRadio`.
3. In `frontend/src/radio/session.ts`, make `failTuneIn` a no-op (no toast, no `tuneOut`, no `radioFailures`). Keep the function so stage 02 can replace it with a schedule call. Remove the `radioFailures` import. If `showToast` is then unused in this file, remove that import too.
4. In `frontend/src/radio/session.ts` `bindAudioHandlers` `onError`, do not toast and do not `tuneOut()`. Leave the handler registered (stage 02 will schedule a rejoin from it).
5. In `frontend/src/radio/session.ts` `writeRadioMediaSession`, change the `pause` handler to Tune out only when `radio.chrome === "tuned"` **and** `!radioAudio.loadInFlight` **and** `!radioAudio.seekInFlight` **and** `!radioAudio.ended`. Keep `stop` → `tuneOut()` unconditional. Keep `play` → `tuneIn()`.
6. In `frontend/src/stores/radio.ts`, delete the `createFailureCap` import, `radioFailures` export, the `failures` alias, and `failures.reset()` in `resetRadioStore`.
7. Delete `frontend/src/radio/failures.ts` and `frontend/tests/radio/failures.test.ts`.
8. In `frontend/tests/radio/session.test.ts`, add cases: (a) `onFaceOrTrack` with chrome `tuned`, face `current`, and a new `radio.track.id` / `prevId` sets chrome to `tuning` then, with mocked `load`/`seek`/`play` resolving, ends `tuned` and never `stopped`; (b) `loadCurrent` rejection (or `failTuneIn` path: `resolvePlaySource` → `unavailable`) while chrome started `tuned` leaves chrome `tuning`, not `stopped`; (c) Media Session is not required — instead dispatch `pause` on `radioAudio.el` while chrome is `tuning` (handlers bound via `onFaceOrTrack`) and expect chrome still `tuning`. Keep “idle while tuning tunes out”.
9. In `frontend/tests/stores/radio.test.ts`, change `"stays tuned when the official current id changes"` so after the second `applySnapshot` chrome is **not** `stopped` (allow `tuning` or `tuned`) and `radio.track?.id` is the new id. Do not require chrome to remain `tuned` across the swap.

### Verify

```sh
pnpm --dir frontend test tests/radio/session.test.ts tests/stores/radio.test.ts
pnpm --dir frontend typecheck
```

Confirm no remaining imports of `@/radio/failures` or `radioFailures`. Confirm `tests/radio/failures.test.ts` is gone.

## Acceptance

- An official current-id change while the user is in the session never sets chrome to `stopped`.
- A load/play/`unavailable` failure never Tunes out and never shows the old “tuned out” toast.
- `pause` while chrome is `tuning` does not Tune out. `pause` while chrome is `tuned` and the element has not ended still does.
- Idle while `tuning` / `tuned` still Tunes out.
- `createFailureCap` / `radioFailures` / `frontend/src/radio/failures.ts` do not exist.
