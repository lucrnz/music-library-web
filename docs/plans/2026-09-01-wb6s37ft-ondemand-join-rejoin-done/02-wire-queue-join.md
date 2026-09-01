# Stage 02: Wire on-demand join and rejoin

## Status
done

## Description

Give the queue session radio’s join loop: sinks wait for ready with the shared 8 s timeout; a successful `play()` starts the shared 8 s hold; unintentional pause, error, soft reject, load timeout, or early `ended` silently retries the same row from last heard position; intentional pause stays paused. Hard blocks still fail once.

## Rationale

This is the user-visible fix. Stage 01 only moved clocks. Without this wiring, next-track HTML still hangs on a blocked `GET /api/stream`, exclusive still clears `loadPending` before audio exists, and a half-second start that pauses stays paused until a tap.

## Invariants

- See [Settled decisions](context/design.md). Hard-block set and intentional-pause rule must match that list.
- `player.ts` does not import `radio.ts` or `frontend/src/radio/`.
- `failCurrentLoad` remains the only writer for a terminal unavailable row (hard blocks). Retryable failures must not set `playSource` to `unavailable` or toast.
- `beginLoad` still bumps `playGen` and stops the HTML sink. A rejoin attempt is a `playIndex` of the current index with `resumeAt`.
- Natural `ended` (within `NEAR_END_SECONDS` of duration, or repeat-one) still advances or loops; it does not schedule rejoin.
- After `JOIN_HOLD_MS` with no fail event, pause is ordinary pause (persist + `wantPaused` unused); the rejoin clock is not armed.

## Risks

- Treating Media Session pause during `loadPending` as unintentional would fight a real lock-screen pause; the user-pause mark must be set in that handler before the sink pauses.
- `beginLoad` → HTML `stop()` aborts an in-flight `canplay`/`play()` with `AbortError`. Stale `playGen` must ignore that abort; only the live generation may treat a soft reject as a failed join.
- A long encode (longer than 8 s) will timeout and retry. That is intended. Do not lengthen the timeout. Do not cancel the server job from the client.
- `wantPaused` after load must cancel hold and must not call `schedule`.

## Implementation

### Files

- `frontend/src/playback/`
- `frontend/src/playback/queueJoin.ts`
- `frontend/src/playback/load.ts`
- `frontend/src/stores/player.ts`
- `frontend/src/playback/sinks/htmlAudioSink.ts`
- `frontend/src/playback/sinks/companionSink.ts`
- `frontend/tests/playback/`
- `frontend/tests/playback/queueJoin.test.ts`
- `frontend/tests/playback/playReject.test.ts`
- `frontend/tests/playback/playTap.test.ts`

### Steps

1. Add `frontend/src/playback/queueJoin.ts`:
   - Export `isHardJoinBlock(reason)` true for `codec_unsupported`, `exclusive_needs_device`, `exclusive_no_format`, `exclusive_readonly`, `exclusive_lossy`, `missing`, `broken`, `no_id`, `offline_no_local`, `cd_not_ready`.
   - Export `isNaturalEnded(currentTime, duration)` using the existing 3 s near-end epsilon (same number as resume-near-end).
   - Export `createQueueJoin(attempt)` wrapping one `createJoinHold()` and one `createRejoinClock(attempt)`: `markUserPause`, `onPlaySucceeded` (cancel clock, `hold.start()`), `onIntentionalPause` (cancel both, clear mark), `onFailedJoin` (cancel hold, `clock.schedule()`), `kick`, `cancel`, getters for `holdPending` and whether a rejoin is active. Do not import the player store or radio modules.
2. Change `frontend/src/playback/sinks/htmlAudioSink.ts` `load`: `setHtmlAudioSrc`, `audio.load()`, `await waitAudioEventWithTimeout(audio, "canplay", JOIN_LOAD_TIMEOUT_MS)`, then `await audio.play()`. Timeout throws `PlayBlockError("play_failed")` (or a `PlayBlockError` whose message is `audio canplay timeout`). Soft reject (`isSoftPlayReject`) no longer returns success — throw `PlayBlockError("play_failed")` so `load.ts` can schedule rejoin.
3. Change `frontend/src/playback/sinks/companionSink.ts` `load`: after a successful `companionLoad`, wait until `duration > 0` or `JOIN_LOAD_TIMEOUT_MS`, same timeout error as radio companion. `released` while `hasLoad` must call `onError` with `PlayBlockError("exclusive_failed")` (or `play_failed`) so the join loop sees a stop, not a silent face.
4. In `frontend/src/stores/player.ts`, construct one `createQueueJoin` whose `attempt` calls `playIndex(pl.index, { resumeAt })` with `resumeAt = player.currentTime` when `currentTime > 0`, else the pending/original seek for this row. `stopPlayback`, `onLeaveQueue` / teardown, and every new `playIndex` (including skip and `reloadCurrentQueueTrack`) call `queueJoin.cancel()` before starting work. After `loadResolved` returns, if `still(gen)` and `wantPaused`, call `onIntentionalPause` and pause; if `still(gen)` and not `wantPaused` and play source is streaming/downloaded, call `onPlaySucceeded`.
5. Wire fail events in `frontend/src/stores/player.ts` / `frontend/src/playback/load.ts`:
   - `onPauseState(true)`: if `queueJoin` has a user-pause mark, `onIntentionalPause`, persist, apply flags. Else if `holdPending`, persist current time, set `loadPending = true`, `onFailedJoin`. Else persist as today.
   - `togglePlay` pause and Media Session `pause` (including the `loadPending` branch) call `markUserPause` then pause / set `wantPaused`.
   - `onError` / `failCurrentLoad` path: if `isHardJoinBlock(reason)`, `failCurrentLoad` as today (exclusive toast unchanged). Else do not write unavailable; keep `loadPending`, `onFailedJoin`.
   - Soft reject and load timeout reach that retryable path (step 2).
   - `onSinkEnded`: if `isNaturalEnded` or `pl.repeat === "one"`, `queueJoin.cancel()` then today’s advance / loop. Else if `holdPending`, `onFailedJoin`. Else today’s `playNext`.
6. In `initAudioListeners`, subscribe the existing connectivity-recovered hook: if session is `queue` and a join is unfinished (load pending, hold pending, or rejoin scheduled) and the user has not intentionally paused, `queueJoin.kick()`.
7. Tests in `frontend/tests/playback/queueJoin.test.ts` (fake timers, mock `attempt`):
   - `onPlaySucceeded` then unintentional fail before `JOIN_HOLD_MS` calls `attempt` at 1 s, then 2 s, 4 s, 8 s.
   - `markUserPause` + `onIntentionalPause` during hold does not call `attempt`.
   - `onPlaySucceeded` + wait `JOIN_HOLD_MS` + later fail does not call `attempt`.
   - `isHardJoinBlock` / `isNaturalEnded` table cases.
   - `kick` after a scheduled fail runs `attempt` immediately and resets delay.
   - `cancel` drops a pending timer.
8. Update `frontend/tests/playback/playReject.test.ts` only if `isSoftPlayReject` itself changes (it should not; the sink no longer swallows it). Update `frontend/tests/playback/playTap.test.ts` if `playTapAction` grows a join-aware case; otherwise leave it. Do not add radio imports to these tests.

### Verify

- `pnpm --dir frontend test -- frontend/tests/playback frontend/tests/radio frontend/tests/stores/radio.test.ts frontend/tests/stores/playbackPosition.test.ts` passes.
- `pnpm --dir frontend typecheck` passes.
- Confirm by reading the new tests: unintentional pause during hold retries; intentional pause does not; hard block does not schedule; natural ended does not schedule.

## Acceptance

- Auto-advance or retry that never reaches `canplay` / duration in 8 s stays on the current row, keeps loading chrome, and retries with 1 s…8 s backoff.
- A start that plays then pauses without a user-pause mark, during the hold, retries the same index from last heard time and does not toast.
- In-app / Media Session pause during the hold or during `loadPending` leaves the row paused and does not auto-resume.
- `ended` near duration still calls `playNext` (or repeat-one loops). `ended` far from duration during the hold retries.
- `codec_unsupported` and exclusive device/format/lossy/readonly blocks still `failCurrentLoad` once.
- Coming back online while a retryable join is unfinished kicks an immediate retry.
- Radio tests still pass. CD paths are untouched.
