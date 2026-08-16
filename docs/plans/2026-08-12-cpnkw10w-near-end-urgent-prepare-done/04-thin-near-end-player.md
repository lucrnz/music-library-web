# Stage 04: Thin near-end prepare in the player

## Status
done

## Description

Wire once-per-play-load near-end urgent prepare into the player as a thin orchestrator: when remaining time ≤ ~15s, peek the next queue track, apply prepare policy, and `requestPrepare(..., { urgent: true })` at most once per `playIndex` load. Fix latch semantics so offline is not permanent for the load; only “fired” and “no distinct next” stick.

## Rationale

This is the product stage. Stages 01–03 make it a short path instead of a second prepare stack. Correct latching preserves the user’s “seek into the end, seek back, don’t re-fire” rule without blocking prepare after a transient offline window.

## Implementation

- In `player.js` (or a tiny helper imported only from player init if it stays small enough):
  - `PREPARE_LEAD_SECONDS = 15`
  - Module flag reset on every `playIndex` / `stopPlayback`
  - On position updates: if not latched and `duration - currentTime <= lead`:
    - `nextIdx = pl.peekNextIndex()`; if `< 0` or same as current → latch (no next) and return
    - if hard offline / unreachable → **return without latching**
    - latch, then async: if stage-03 helper says the next track needs stream prepare, `requestPrepare([next], getActiveStreamCodec(), { urgent: true })`
  - Do **not** import `getTrackRecord` / reimplement local-prefer checks in the player
- Call sites: prefer one audio position sync path used by `timeupdate`, `loadedmetadata`, and seek completion (`seekToFraction` / Media Session `seekto`) so prepare is not sprinkled as four independent special cases. Acceptable minimum: shared `maybePrepareNext()` invoked from those paths.
- Docs: keep the brief client-interaction note in `docs/systems/transcoding.md` (urgent prepare once per load near end).
- Verify:
  1. Two+ queue tracks needing stream: enter last 15s → one urgent prepare for next id
  2. Seek into last 15s, seek to start, re-enter window → still one request for that load
  3. Next track → flag resets; prepare can fire again for the following item
  4. Offline at window entry, then online still in window → prepare can still fire once
  5. Bulk queue prepare remains non-urgent; play stream path still urgent via `ensure_stream`
