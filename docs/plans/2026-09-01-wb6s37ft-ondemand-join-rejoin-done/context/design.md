**Archive.** Decisions in this file were current as of 2026-09-01 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# On-demand join hold and rejoin

## Goal

Queue playback (HTML stream/download and exclusive companion) must recover from a next-track start that never becomes real audio — stuck on “Loading stream…”, or a fraction of a second of sound then silence — without the user taking the phone out and tapping Play.

A join is committed only after **8 seconds of uninterrupted playback**. Until then, an unintentional stop is a failed join and the same track is retried. Radio already has this loop; on-demand must use the same clocks.

## Settled decisions

- **Scope is the queue session only.** HTML sink (stream and downloaded blob) and exclusive/companion. CD stays on its own session and load path.
- **Same 8 s window as radio.** One shared `JOIN_HOLD_MS = 8000`. The “5 s” in the original request was a misremembered number; radio is 8 s in code and docs.
- **Same rejoin backoff as radio.** Shared `createRejoinClock`: 1 s, doubling, cap 8 s. Retry the current row forever until the hold survives, the user leaves the join, or a hard block lands.
- **Load is not allowed to hang forever.** Shared `JOIN_LOAD_TIMEOUT_MS = 8000`. Queue HTML waits for `canplay` then `play()` (radio already waits `canplay`). Queue companion waits for first duration (radio already does). Timeout is a failed join.
- **Clocks live in `playback/`, not under `radio/`.** `player.ts` must not import `radio.ts`. Radio migrates onto the shared hold, rejoin, and load-timeout modules with no product change.
- **Silent retry, loading chrome.** No toast on retryable failures. `player.loadPending` stays true while a join is in flight or a rejoin is scheduled so Play shows “Loading stream…”.
- **Intentional pause cancels the loop and stays paused.** In-app Pause, lock-screen pause, and headset/Media Session pause are user leave-from-join. They set a user-pause mark before the sink pauses. After that, do not schedule rejoin. `wantPaused` after a successful load is the same (stay paused, no hold).
- **Unintentional pause at the start of a song is a failed join.** An element/companion pause during the hold that did not go through the user-pause mark retries. This is only classified during the hold (start of the load), not after 8 s.
- **Natural `ended` is success and advances.** `ended` near duration (existing 3 s near-end rule) or repeat-one at end is not a retry. `ended` far from duration during the hold is a failed join.
- **Soft `play()` reject is a failed join.** `NotAllowedError` / `AbortError` on auto-advance or retry schedule rejoin (they are not a successful attach).
- **Hard blocks do not spin.** `codec_unsupported`, `exclusive_needs_device`, `exclusive_no_format`, `exclusive_readonly`, `exclusive_lossy`, `missing`, `broken`, `no_id`, `offline_no_local` still go through `failCurrentLoad` once. Connectivity recovery kicks a retry only when the last failure was retryable or we were still joining (so `offline_no_local` can heal when the server returns).
- **Retry the same index at last heard position.** `resumeAt` is `currentTime` when it has moved, else the seek this `playIndex` already intended. Do not skip to the next row.
- **No new server protocol.** `GET /api/stream` still blocks until the encode is complete and never serves `.partial`. Client abort of a waiting GET must not be assumed to cancel the encode job; the next GET waits on the same job. Prepare stays fire-and-forget; there is no encode-ready gate before advance.
- **Radio pause-during-hold stays radio’s rule.** Any radio pause during the hold is still a failed Tune-in, not an intentional pause. Only the clocks are shared.

## Design

On-demand today treats `play()` resolving (or a soft reject) as a finished load. There is no load timeout, no join hold, and no retry. `failCurrentLoad` parks on the row. A Media Session pause while `loadPending` latches `wantPaused`, so a long blocked encode can finish and immediately pause.

Radio already splits “chrome looks playing” from “join committed”:

1. Load waits `canplay` / first duration, 8 s cap.
2. `play()` success flips chrome to `tuned` and **starts** an 8 s hold; rejoin is cancelled.
3. Pause or error while `hold.pending` is a failed join (`tuning` + 1 s…8 s rejoin).
4. After the hold elapses, pause means the user left.

Queue gets the same two machines (`createJoinHold`, `createRejoinClock`) plus the shared load timeout. The queue-specific wrapper (`playback/queueJoin.ts`) is the only place that interprets **intentional vs unintentional** pause. Radio keeps `pauseWhileTuned` as-is.

```
playIndex / rejoin attempt
        │
        ▼
 beginLoad (bump gen, loadPending)
        │
        ▼
 sink.load: canplay|duration ≤ 8 s → play()
        │
        ├─ hard block → failCurrentLoad, no clock
        ├─ timeout / play_failed / soft reject / exclusive_failed|not_ready
        │         → silent schedule rejoin (same index, last heard)
        └─ play ok and not wantPaused → cancel rejoin, start 8 s hold
                │
                ├─ user pause (togglePlay / Media Session pause) → cancel both, stay paused
                ├─ unintentional pause / error / ended-far-from-duration → schedule rejoin
                └─ 8 s with no issue → hold done; later pause is ordinary pause
```

`onConnectivityRecovered` kicks the queue rejoin clock only while a join is unfinished (load pending, hold pending, or a rejoin already scheduled) and the user has not intentionally paused.

Leaving the queue (`stopPlayback`, `become` away from queue, a different-row `playIndex`) cancels hold and rejoin.

## Stage map

Stage 01 first, because 02 must import one hold and one rejoin clock. It is a radio-behavior-neutral move: shared modules, radio call sites and unit tests retargeted, load-timeout constant used by radio audio. No queue behavior change yet.

Stage 02 depends on 01. It is the product change: queue sinks wait for ready with the shared timeout, `queueJoin` owns hold/rejoin/pause classification, `player.ts` / `load.ts` call it. Tests that lock the on-demand loop live here so the loop cannot ship without them.

Stage 03 depends on 02 (paths and rules must match the code). Living docs (`playback.md`, `radio.md`, frontend conventions) are updated so the shared clocks and queue join rules outlive this plan directory. No ADR; those pages are already the source-of-truth map.

## Out of scope

- CD session (`become("cd")`, `cdLoad.ts`)
- Serving partial encodes, progressive stream, or an encode-ready HTTP/WebSocket signal
- Gating `playNext` on prepare completion
- Retry-cap, skip-on-fail, or toast-on-retry
- Treating `waiting` / `stalled` as their own fail events (unintentional pause, error, load timeout, and early `ended` cover start-of-song)
- Changing radio’s “any pause during hold = failed Tune-in” rule
- Media Session `stop` handling on the queue (still unset)

## Assumptions

- Aborting a client `GET /api/stream` that is blocked in `ensure_stream` does not cancel the encode; the job stays urgent and the next GET waits on `job.done`.
- Lock-screen and headset pause arrive through the installed Media Session `pause` handler (same mark as in-app Pause).
- After 8 s of healthy audio, start-of-song recovery is no longer in play; ordinary pause/resume applies.
- Existing `NEAR_END_SECONDS = 3` is the right “natural end” epsilon for `ended`.
