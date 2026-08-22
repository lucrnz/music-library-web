# Stage 03: Wire radio listen cycle

## Status
done

## Description

Start, sample, and discard the existing listen cycle from radio. Count only while this client is `tuned`. Use the same 70% / seek / ended rules as on-demand.

## Rationale

Stages 01–02 make a radio-origin event legal. This stage is the only behavior change a listener notices: tuned-in radio can increment Stats.

## Invariants

- Start a cycle only after successful `load` + seek-to-clock + `play`, when `chrome` becomes `"tuned"`. Not on tab-open, `tuning`, or `stopped`.
- `origin` is `"radio"`. `playSource` is the resolved delivery (`streaming` | `downloaded`). `profile` is the resolved delivery profile (`source` when lossy) — not `radio.playProfileId` (null on lossy).
- Duration is the official track duration (`radio.track.duration`), same as queue using the catalog tag. Unknown duration still fires only on `onEnded`.
- Discard at the start of every `loadCurrent` and whenever chrome leaves `tuned` (Tune out, `leaveRadio`, catch-up, skip-pending, idle tune-out, failed tune). Do not carry `listenedSec` across Tune-out or a new official track.
- Sample only while `chrome === "tuned"` and the element is playing. Skip samples during `loadInFlight` / `seekInFlight` (same idea as queue skipping `player.seeking`). Pauses and seek jumps still do not add (accumulator).
- Do not call `onRestart` for radio (no repeat-one). Station advance is a new load / new cycle.
- Radio must not import `player.ts`. Call `@/listens/bridge` from `radio/session.ts` / `stores/radio.ts` only. Do not infer listens from `/api/stream` or the station clock.
- The bridge stays a singleton. Queue `become("queue")` already discards via `beginLoad`; radio Tune-in already discards before `tuning`.

## Risks

- Starting the cycle before the join seek would still be correct (large delta ignored) but timeupdates during seek are easier to get wrong. Start only after seek + play, then discard at the next load so an old cycle cannot eat the new element's samples.
- Using `radio.playProfileId` would skip every lossy radio track (`maybeStartListenCycle`'s `!profile` pitfall).

## Implementation

### Files

- `frontend/src/radio/session.ts`
- `frontend/src/stores/radio.ts`
- `frontend/tests/radio/session.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/radio/session.ts`, import `startCycle`, `onTime`, `onEnded`, and `discard` from `@/listens/bridge`. At the top of `loadCurrent`, `discard()` so a previous official play cannot accumulate against the new element.
2. After `rememberDelivery` + `radio.chrome = "tuned"` in `loadResolvedRadio` (success path only, same `radioGen`), call `startCycle` with `trackId: track.id`, `durationSec: radio.track.duration ?? null`, `profile: resolved.profile` (lossy is `SOURCE_TAG` / the resolved `source` tag), `playSource: resolved.source`, `origin: "radio"`. If `resolved.profile` is missing, do not start a cycle.
3. In `bindAudioHandlers`, feed `onTime` from the radio element's timeupdate (`radioAudio.sink.setHandlers` or an equivalent hook that does not drop the existing pause / ended / error listeners). Call `onTime` only when `radio.chrome === "tuned"`, not `loadInFlight` / `seekInFlight`, with `playing: !radioAudio.paused && !radioAudio.ended`. On ended, call `onEnded()` (unknown-duration fallback) and keep “station clock owns advance” (do not Tune out).
4. `discard()` on every path that leaves `tuned` without going through a new successful start: `tuneOut` and `leaveRadio` in `frontend/src/stores/radio.ts`; catch-up / skip-pending stop in `onFaceOrTrack`; `failTuneIn` / idle `tuneOut`. `tuneIn` already discards — keep that.
5. Tests in `frontend/tests/radio/session.test.ts`: mock `startCycle` / `onTime` / `onEnded` / `discard` on `@/listens/bridge` (the file already mocks `discard`). After a successful `loadCurrent`, `startCycle` was called once with `origin: "radio"`, the resolved `playSource` / `profile`, and the track id. `loadCurrent` while already tuned discards then starts again (track change / reload). Catch-up while tuned discards and does not start. Do not import `player.ts`.
6. Tests in `frontend/tests/stores/radio.test.ts`: Tune out and `leaveRadio` / `become` leave discard the cycle; tab-open without Tune-in never calls `startCycle`. If that file cannot reach `startCycle` without pulling session, assert `discard` on Tune out and keep start assertions in `session.test.ts`.

### Verify

```sh
pnpm --dir frontend test -- tests/radio/session.test.ts tests/stores/radio.test.ts tests/listens/accumulator.test.ts
pnpm --dir frontend typecheck
```

Confirm radio tests still do not import `@/stores/player`.

## Acceptance

- A tuned-in client that hears 70% of the full track after the join seek enqueues a listen with `origin: "radio"` and the real delivery `play_source`.
- Tune-in at 80% does not fire. Tune-out at 50% then Tune-in again does not fire from combining halves.
- Tab-open, `tuning`, simulation (no this-client tune-in), and station advance with no tuner do not write events.
- Queue listen behavior is unchanged.
