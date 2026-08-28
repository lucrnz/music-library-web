# Stage 02: Play does not restart an in-flight wait

## Status
done

## Description

While a queue `playIndex` / `loadResolved` is in flight, Play and Pause must not start another load. They only flip a want-paused latch applied when the current load finishes. `ensureAudible` on `none` / `unavailable` must reload with `resumeAt` so a hard fail cannot send the next Play to 0.

## Rationale

After stage 01 the codec reload is at the right time, but `beginLoad` still sets `playSource` to `none` and shows Play. A tap calls `playIndex` again, bumps `playGen`, and throws away the `/api/stream` that is blocked on `ensure_stream`. That is the mash-Play / long-encode failure.

## Invariants

- `loadPending` is true from `beginLoad` until that generation finishes (`loadResolved` return, `failCurrentLoad`, `invalidateLoads`, or `teardownOnDemandMedia`). A remint inside the same `gen` stays pending.
- `playTapAction` is the only decision for `ensureAudible` / Media Session play: `noop` | `flip-want` | `resume` | `reload` | `start-first`.
- `flip-want` does not call `playIndex`, `beginLoad`, or `sink.pause` / `sink.resume`. `sink.pause` during a waiting `play()` can abort the fetch.
- When the load succeeds, honor the latch: pause if want-paused, otherwise leave the sink playing (`playIndex`’s `resumePaused` is only the initial latch value).
- `reload` (Play while `playSource` is `none` or `unavailable` and not pending) passes `resumeAt` from `player.currentTime` if `> 0`, else `resumeSeconds` of the stored slot. It must not call `clearPlaybackPosition` by omitting both `resumeAt` and a positive `keepAt`.
- Queue-row tap of the current loaded track is not `ensureAudible`; it stays a `playIndex` without resume opts.

## Risks

- Calling `sink.pause()` while `htmlAudioSink.load`’s `play()` is waiting will reject that `play()` and can look like `play_failed`. The latch must not touch the sink.
- Forgetting to clear `loadPending` on `invalidateLoads` / leave-queue leaves Play stuck as flip-want.

## Implementation

### Files

- `frontend/src/playback/playTap.ts`
- `frontend/tests/playback/playTap.test.ts`
- `frontend/src/stores/playerState.ts`
- `frontend/src/playback/load.ts`
- `frontend/src/stores/player.ts`

### Steps

1. Add `frontend/src/playback/playTap.ts` exporting `PlayTapAction` and `playTapAction({ hasTracks, index, loadInFlight, playSource })`: no tracks → `noop`; `loadInFlight` → `flip-want`; `index < 0` → `start-first`; `playSource` is `streaming` or `downloaded` → `resume`; else `reload`.
2. Add `frontend/tests/playback/playTap.test.ts` covering each action, including `unavailable` + not in flight → `reload` and `none` + in flight → `flip-want`.
3. On `player` in `frontend/src/stores/playerState.ts`, add `loadPending: boolean` default `false`.
4. In `frontend/src/playback/load.ts`, set `player.loadPending = true` at the start of `beginLoad`. Clear it to `false` on every terminal path of that generation: return from `loadResolved` (success, stale `!still(gen)`, unavailable after apply, hard `attemptPlay` fail), `failCurrentLoad`, `invalidateLoads`, and `teardownOnDemandMedia`. Do not clear between a downloaded fail and the same-`gen` remint.
5. In `frontend/src/stores/player.ts`, keep a module `wantPaused` flag. `playIndex` sets it from `opts?.resumePaused === true`. `ensureAudible` switches on `playTapAction`: `flip-want` toggles `wantPaused`; `resume` calls `getActiveSink().resume()`; `start-first` calls `playIndex(0)`; `reload` calls `playIndex(pl.index, { resumeAt })` with `resumeAt` from Invariants. After a successful `loadResolved` in `playIndex`, if `still(gen)` and `wantPaused`, `pause()` the sink (replace today’s `opts?.resumePaused` check).
6. Media Session `play` stays `ensureAudible`. Media Session `pause` while `player.loadPending` only sets `wantPaused = true`; otherwise today’s `getActiveSink().pause()`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/playback/playTap.test.ts
pnpm --dir frontend typecheck
```

On a running app: play a lossless track, seek in, switch to a Streaming profile that is not already cached so `/api/stream` blocks. Mash Play (and Pause) during the wait. Confirm a single encode/load completes at the stage-01 seek, and that Pause-during-wait leaves the track paused when ready. After a forced hard fail (invalid `src` is enough in a unit sense; in the app, drop the server mid-wait if you can), Play must start at the held seek, not 0.

## Acceptance

- Play/Pause during `loadPending` does not increment `playGen` or start a second `/api/stream` for the same row.
- Want-paused is applied after the in-flight load succeeds.
- `ensureAudible` reload after `unavailable` / `none` passes `resumeAt` and does not clear the slot.
- `playTap.test.ts` and `pnpm --dir frontend typecheck` pass.
- `player.ts` is not imported by tests.
