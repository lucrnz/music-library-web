# Stage 04: become(session), one volume, radioGen

## Status
done

## Description

Rewrite `onDemandControl.ts` as `become("none" | "queue" | "radio")`. One `setOutputVolume` writes face + storage. Radio gets `radioGen`; only the station face advances audio. Stored `preview` chrome goes away.

## Rationale

The hook bag moved the player/radio cycle instead of deleting it. Volume has three writers. Radio load has two drivers and no generation. This stage is the session model those copies were standing in for.

## Invariants

- `player.ts` does not import `radio.ts`. Radio does not import `player.ts`.
- Radio audio stays a separate `HTMLAudioElement`. Do not merge into `htmlAudioSink`.
- `RADIO_EXCLUSIVE_SNAP` stays. Exclusive radio stays out.
- `needsCompanionStop` behavior unchanged (unavailable or sink change → stop companion). Same-sink exclusive does not release the hog.
- Socket rule unchanged: up for the Radio tab or chrome `stopped` | `tuning` | `tuned`.
- Opening `/radio` still does not auto Tune in and still does not steal the on-demand bar (`radioChromeActive` is still stopped/tuning/tuned).

## Risks

- `connect()` today promotes `inactive → preview`. After this stage it must leave chrome `inactive` and set `tabOpen`. Tests in `radio.test.ts` assert `"preview"`.
- `tuneIn` must not call `loadCurrent` after `sendTuneIn`. If the face handler is not wired, Tune-in never starts audio.
- `become("queue")` while already queue must be a no-op (do not teardown the load we are about to start).

## Implementation

### Files

- `frontend/src/playback/onDemandControl.ts`
- `frontend/src/playback/playIntent.ts`
- `frontend/src/playback/teardown.ts`
- `frontend/src/stores/player.ts`
- `frontend/src/stores/radio.ts`
- `frontend/src/stores/playerPrefs.ts`
- `frontend/src/components/radio/RadioNowPlaying.vue`
- `frontend/tests/playback/handoff.test.ts`
- `frontend/tests/playback/teardown.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `onDemandControl.ts` replace `setOnDemandClaimHook` / `claimOnDemand` / `bindOnDemandControl` with `become(next: "none" | "queue" | "radio")` and a session register API the two stores call at init (`onLeaveQueue`, `onLeaveRadio` — stop sinks / `exitToQueue` internals without importing the other store). `become` no-ops when `next === active`. Leaving radio runs the radio-leave fn. Leaving queue runs bump + `clearPlaySourceState` + stop sinks. `become("queue")` restores Media Session; `become("radio")` suspends it. Delete `claimOnDemand`.
2. `playIndex` / `stopPlayback` call `become("queue")` and `become("none")` respectively. `tuneIn` calls `become("radio")` instead of `suspendMediaSession()` + `stopOnDemandSinks()` + the claim hook. Keep `installOnDemandMediaSession`.
3. Move `needsCompanionStop` next to `PlayIntent` in `playIntent.ts`. Delete `teardown.ts`. Point `player.ts` and `teardown.test.ts` at the new import.
4. Add `setOutputVolume(v)` in `playerPrefs.ts`: clamp, write `player.volume`, `writeVolume`. `player.setVolume` calls it then `activeSink.setVolume`. `RadioNowPlaying` volume handler calls `setOutputVolume` only (watch still applies to radio audio). Delete `radio.setVolume`.
5. Radio chrome type is `inactive | stopped | tuning | tuned`. Delete stored `preview`. `connect()` sets `tabOpen` / opens the socket and does **not** change chrome from `inactive`. `tuneIn` from `inactive` goes to `stopped` then `tuning` as today (without the `preview` disjunct).
6. Add `radioGen`. `loadCurrent` captures/bumps it and aborts when stale. `tuneIn` sends `tune_in` and returns; `onFaceOrTrack` is the only caller of `loadCurrent`. Reconnect / profile change go through the same face path (bump gen when the official id or lossy bit changes).
7. Rewrite `handoff.test.ts` against `become` (queue while radio runs leave-radio; radio while queue runs leave-queue; same-session no-op). Update `radio.test.ts` preview cases to `inactive` + `tabOpen`.

### Verify

- `rg -n "claimOnDemand|setOnDemandClaimHook|bindOnDemandControl" frontend/src frontend/tests` is empty.
- `rg -n "preview" frontend/src/stores/radio.ts` is empty (comments too).
- `rg -n "export function setVolume" frontend/src/stores/radio.ts` is empty.
- `rg -n "from \\\"@/playback/teardown\\\"" frontend` is empty.
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- One session value. No hook bag. No `claimOnDemand` name.
- Volume has one writer for face + storage. Radio watch remains the radio apply path.
- Radio chrome has four values. Tab-open-without-tune-in is `inactive` + `tabOpen` and does not steal the player bar.
- Overlapping radio loads cannot both win: a stale `loadCurrent` is a no-op.
- `teardown.ts` is gone; `needsCompanionStop` still has tests.
