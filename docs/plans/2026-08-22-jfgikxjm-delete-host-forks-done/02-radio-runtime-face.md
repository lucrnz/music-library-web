# Stage 02: Radio runtime face

## Status
done

## Description

Move the station-face machine into `radio/runtime.ts`. The store stays the reactive chrome face. Reconnect stops copying the face ladder.

## Rationale

The last extract parked a 12-field host bag and left `onFaceOrTrack` in the store. Finishing that extract deletes `currentLoadKeys` and the reconnect copy.

## Invariants

- Tune-in still calls `become("radio")`. Queue play still calls `become("queue")`.
- Radio still does not import `player.ts`. Radio still does not implement `PlaybackSink`.
- Chrome values stay `inactive | stopped | tuning | tuned`. Faces stay `catching_up | skip_pending | idle | current`.
- Socket stays up for the Radio tab or chrome `stopped` | `tuning` | `tuned`.
- Tuner codec is still a browser-listed profile, never `source`.

## Risks

- `radio.ts` → `runtime.ts` → injected `tuneIn` / `tuneOut` / `applySnapshot` must stay acyclic. If typecheck reports a cycle, inject those three only — do not add `radio/state.ts`.
- Reconnect must preserve today’s idle → `tuneOut`, catching_up/skip_pending → chrome `tuning`, current → retune + `onFaceOrTrack` behavior.

## Implementation

### Files

- `frontend/src/stores/radio.ts`
- `frontend/src/radio/runtime.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. Move `onFaceOrTrack`, track-change detection (`lastLoadedTrackId` / `lastLoadedLossy`), and `maybeReseek` from `frontend/src/stores/radio.ts` into `frontend/src/radio/runtime.ts`. Delete `currentLoadKeys`.
2. In `onReconnect`, call that `onFaceOrTrack`. Delete the copied idle / catching_up / current ladder in `runtime.ts`.
3. Keep one `socketRequired` in `runtime.ts`. Delete the store copy. Set `radio.connected = true` on socket `open`, not on construct.
4. `stores/radio.ts` keeps `radio` reactive, `applySnapshot`, `tuneIn`, `tuneOut`, `setTabOpen`, `connect` / `disconnect`, and the connectivity / visibility / volume watches. `applySnapshot` still mutates `radio.*` then asks runtime to handle the face.
5. Shrink `RadioRuntimeHost` to `{ radio, audio, failures, applySnapshot, tuneIn, tuneOut }` plus any remaining chrome predicate the cycle still needs. Delete host fields that runtime now owns (`onFaceOrTrack`, `interpolatedPosition` if it can import from the store, `radioChromeActive` if it can read `radio.chrome`).
6. Update `frontend/tests/stores/radio.test.ts`. Inline `getActiveStreamCodec()` where tests used `tuneInCodec`, or keep `tuneInCodec` only if a test still needs a named helper — do not leave it as a production alias unused by the app.

### Verify

- `pnpm --dir frontend test -- frontend/tests/stores/radio.test.ts frontend/tests/radio/audio.test.ts frontend/tests/radio/failures.test.ts frontend/tests/radio/sync.test.ts frontend/tests/playback/handoff.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "currentLoadKeys|tuneInCodec" frontend/src` is empty (tests may still mention `tuneInCodec` only if the helper remains; production `frontend/src` must not)
- `rg -n "function socketRequired" frontend/src/stores/radio.ts frontend/src/radio/runtime.ts` is one match (runtime)

## Acceptance

- `onFaceOrTrack` / change-detection / `maybeReseek` live in `radio/runtime.ts`. Reconnect does not reimplement the face ladder.
- `currentLoadKeys` is gone. One `socketRequired`. `connected` flips on open/close.
- `stores/radio.ts` is the reactive face plus `applySnapshot` / `tuneIn` / `tuneOut` / tab API. No third radio module.
