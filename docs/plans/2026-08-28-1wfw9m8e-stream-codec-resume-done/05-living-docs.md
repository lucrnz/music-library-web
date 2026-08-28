# Stage 05: Living docs

## Status
done

## Description

Update playback and frontend-convention docs so Streaming-codec reload, Play-during-wait, and the busy Play face match stages 01–04. Do not leave “changing Streaming restarts the current track” in the living set.

## Rationale

`docs/systems/playback.md` currently says a Streaming change restarts the track. After 01–04 that sentence is false and will mislead the next change to the watch or to `ensureAudible`.

## Invariants

- Source of truth for request shapes and encoder argv stays the code. Docs describe intent and the client contract only.
- `docs/plans/` is not living documentation. Do not link this plan directory from the living pages.
- No ADR.

## Risks

- Editing only `playback.md` leaves `docs/frontend/conventions.md` saying exclusive toggle is the only position-preserving reload.

## Implementation

### Files

- `docs/systems/playback.md`
- `docs/frontend/conventions.md`

### Steps

1. In `docs/systems/playback.md`, replace “Changing it restarts the current track” with: a Streaming change reloads the current queue row at the current seek and keeps paused/playing; Play/Pause during that load does not start a second `playIndex`; a watch-time `play()` autoplay reject stays attached and the next Play is `resume()`; the Play button is busy while `loadPending`. Keep the exclusive-toggle sentence; note Streaming uses the same reload helper.
2. In the source-of-truth / `setStreamCodec` bullets, state that `setStreamCodec` still persists only, and that `player.ts` owns prepare-on-change plus `reloadCurrentQueueTrack`.
3. In `docs/frontend/conventions.md`, on the player-store paragraph, say the `settings.streamCodec` watch reloads the queue row at the current position (same helper as exclusive enable/disable), and that `player.loadPending` is the Play-button busy flag. Do not mention radio.

### Verify

```sh
rg -n "restarts the current track|reloadCurrentQueueTrack|loadPending" docs/systems/playback.md docs/frontend/conventions.md
```

Confirm the old “restarts the current track” line is gone and the new helper / `loadPending` sentences are present. Skim both pages for leftover “codec change starts at 0” wording.

## Acceptance

- Living docs match shipped 01–04 behavior: resume at seek, no Play-restart during wait, soft `play()` reject, busy Play face.
- `setStreamCodec` is still documented as persist-only.
- This plan directory is not linked from those pages.
