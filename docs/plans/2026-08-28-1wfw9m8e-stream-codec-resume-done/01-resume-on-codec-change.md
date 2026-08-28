# Stage 01: Resume on codec change

## Status
done

## Description

When Streaming codec changes during an on-demand queue session, reload the current row at `player.currentTime` and keep the paused/playing state. Do not clear the resume slot or start at 0. Hold the seek face on those seconds across `beginLoad`’s sink stop.

## Rationale

The Streaming watch is the only reload that still calls bare `playIndex(pl.index)`. Exclusive toggle already passes `resumeAt` / `resumePaused`; this stage copies that contract onto codec change so the reported seek-to-0 bug is gone before Play-wait work lands.

## Invariants

- `setStreamCodec` still only persists and closes Settings. Prepare and play stay in `player.ts`.
- `activeSession() !== "queue"` or `pl.index < 0`: prepare still runs; no `playIndex`.
- Queue reload uses the same opts as exclusive enable/disable: `resumeAt: player.currentTime`, `resumePaused: getActiveSink().paused`, after `persistCurrentPosition()`.
- `playIndex` still computes `seekTo` before `beginLoad`. After `beginLoad` returns, if `seekTo > 0`, write `pendingResume` and set `player.currentTime = seekTo` in the same turn (pause from `stop` is sync).
- While `pendingResume` matches the live `playGen`, `syncTransportFlags` / `onSinkTime` must not paint sink time 0. `flushPendingResume` still seeks when duration is known.
- A tap of the already-loaded current queue row is unchanged: starts at 0 and clears the slot.

## Risks

- Capturing `player.currentTime` after `beginLoad` would resume at 0. Capture `seekTo` first; restore the face after `beginLoad`.
- Sharing one helper with the exclusive watch avoids the two reloads drifting. Do not leave exclusive on a second inline copy.

## Implementation

### Files

- `frontend/src/stores/player.ts`

### Steps

1. In `frontend/src/stores/player.ts`, extract `reloadCurrentQueueTrack()`: if `activeSession() !== "queue"` or `pl.index < 0`, return; else `persistCurrentPosition()` and `void playIndex(pl.index, { resumeAt: player.currentTime, resumePaused: getActiveSink().paused })`.
2. Point the `settings.streamCodec` watch and the `exclusiveAudio.enabled` watch at that helper (exclusive watch keeps its `prepareTracks` call as it is today).
3. In `playIndex`, after `const gen = beginLoad()`, if `seekTo != null`, set `pendingResume = { gen, seconds: seekTo }` and if `seekTo > 0` assign `player.currentTime = seekTo`.
4. In `syncTransportFlags`, skip assigning `player.currentTime` from the sink when `pendingResume` is set and `still(pendingResume.gen)`. Leave `onSinkTime`’s existing `pendingResume` early-return + `flushPendingResume` as the seek path.

### Verify

```sh
pnpm --dir frontend typecheck
```

On a running app: play a lossless queue track, seek well into it, change Streaming to another listed profile. Confirm the seek bar and time labels stay on that position during the wait and that audio resumes there (or stays paused there if you were paused). Confirm Play all / tapping the current queue row still starts at 0.

## Acceptance

- Codec change while playing a queue track resumes at the pre-change `currentTime`, not 0.
- Codec change while paused stays paused at that time.
- The seek face does not jump to 0:00 for the duration of the encode wait.
- Exclusive enable/disable still reloads through the same helper with the same opts.
- Radio is untouched.
- `pnpm --dir frontend typecheck` passes.
