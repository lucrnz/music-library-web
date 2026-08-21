# Stage 06: On-demand / radio session handoff

## Status
done

## Description

`onDemandControl.ts` grows `claimOnDemand` / `claimRadio`. `player.ts` stops importing `radio.ts`. Volume is `player.volume` in `playerState.ts`; radio watches it. Media Session ownership switches only through the claim helpers. Status line stays exclusive-first.

## Rationale

Stage 05 makes play a single load. This stage deletes the remaining station leak (`exitToQueue`, `setRadioVolume`) so the next exclusive-radio feature cannot land as another branch inside `player.ts`.

## Invariants

- `onDemandControl.ts` still imports neither `radio.ts` nor `player.ts`.
- `radio.ts` still does not import `player.ts`. It may import `playerState.ts` / `playerPrefs.ts`.
- `playIndex` and `stopPlayback` claim on-demand (which tunes radio out). `tuneIn` claims radio (which stops on-demand sinks and discards the listen cycle — same as today’s `stopOnDemandSinks` + `discardListen`).
- `RADIO_EXCLUSIVE_SNAP` stays. Do not rewrite `playbackStatus.ts`.
- Tune-out vs exit-to-queue chrome (`stopped` vs `inactive`) stays as it is today; only the call site moves.

## Risks

- `RadioNowPlaying.vue` currently writes volume three ways because it cannot import `player.ts`. After this stage it writes `player.volume` (via `playerState` / a tiny volume helper) once; radio’s watch applies it to radio audio.
- `setVolume` in `player.ts` today also calls `setRadioVolume` when chrome is active. After this stage that call is gone — the watch must be installed whenever radio audio exists, not only when the radio tab is open.

## Implementation

### Files

- `frontend/src/playback/onDemandControl.ts`
- `frontend/src/stores/player.ts`
- `frontend/src/stores/radio.ts`
- `frontend/src/components/radio/RadioNowPlaying.vue`
- `frontend/src/components/player/NowPlayingFull.vue` (only if it also fans volume to radio)
- `frontend/tests/stores/radio.test.ts`
- `frontend/tests/playback/handoff.test.ts` (new, if claim helpers are testable without a browser Media Session)

### Steps

1. Add `claimOnDemand()` and `claimRadio()` to `onDemandControl.ts`. `claimOnDemand` restores on-demand Media Session handlers (today’s `restoreMediaSession`). `claimRadio` suspends them (today’s `suspendMediaSession`). Bind optional `onClaimOnDemand` / `onClaimRadio` callbacks from the stores at init so the module still does not import either store: radio registers “exit to inactive / stop radio audio”; player registers nothing extra beyond today’s sink stop (already `bindOnDemandControl`).
2. Practical wiring that keeps the cycle break: `radio.ts` exports `exitToQueue` as now. `initAudioListeners` (or radio `connect`) registers `exitToQueue` as the on-demand-claim side effect via a setter on `onDemandControl` (`setOnDemandClaimHook`). `playIndex` / `stopPlayback` call `claimOnDemand()` instead of `exitToQueue()`. `tuneIn` calls `claimRadio()` then today’s load. Do not import `radio.ts` from `player.ts`.
3. Delete `radioChromeActive` / `setRadioVolume` imports from `player.ts`. `setVolume` / `applyVolume` only write `player.volume` and the active on-demand sink. In `radio.ts`, `watch(() => player.volume, setVolume)` (from `playerState`) for the radio element, installed once when the radio store inits.
4. `RadioNowPlaying` volume events write `player.volume` + `writeVolume` only. Remove the extra `setRadioVolume` call.
5. `writeRadioMediaSession` stays in `radio.ts` but runs only after `claimRadio`. Leaving radio via `claimOnDemand` must `restoreMediaSession` (already the restore path).
6. Tests: `player.ts` has no `@/stores/radio` import (grep). Radio volume watch updates radio audio when `player.volume` changes. Existing radio store tests still pass.

### Verify

- `rg -n "from \\\"@/stores/radio\\\"" frontend/src/stores/player.ts` is empty.
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- `player.ts` does not import `radio.ts`.
- Starting on-demand play while tuned exits radio to inactive (same as today’s `exitToQueue`).
- Tuning in still stops on-demand sinks and listen cycles.
- One volume value drives both the on-demand sink and radio audio.
- `RADIO_EXCLUSIVE_SNAP` and `playbackStatus.ts` are unchanged.
