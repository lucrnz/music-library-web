# Stage 02: Persist and restore

## Status
done

## Description

Wire the position store into boot, pause, page hide, paused seeks, cold `playIndex`, and the invalidation paths in [context/design.md](context/design.md). HTML and companion sinks both resume. No auto-play.

## Rationale

Stage 01 cannot change what the user hears or sees. This stage is the restore the existing now-playing shell is missing.

## Invariants

- Capture `playSource === "none"` *before* `beginLoad()` / `clearPlaySourceState()`. After that, source is `none` for every load.
- Seek on Play only for that cold load, and only when `resumeSeconds` matches `pl.tracks[index].id`.
- Already-loaded `playIndex` (source was `streaming` or `downloaded`) starts at 0 and `clearPlaybackPosition()`.
- Cold `playIndex` of a different id also clears.
- Persist on pause only when `playSource` is `streaming` or `downloaded` (so `stop()` after a source clear does not rewrite the slot).
- Page hide persists whenever `pl.current.id` exists and `player.currentTime` is finite `>= 0`.
- `seekToFraction` / Media Session `seekto` persist when paused. When `playSource === "none"`, they update `player.currentTime` from `player.duration` and write; they do not call the sink.
- Companion: do not call `seek` until `activeSink.duration > 0`. Hold a pending resume keyed by `playGen` and flush from `onDuration` / `onTime`.
- Re-clamp with sink duration at flush time (tag duration may differ).
- `stopPlayback` clears the slot. Repeat-one `ended` (seek 0 + resume) does not clear. Advance / skip / queue clear / track end that leaves the track does.
- Do not call `play()` / `resume()` from boot or hydrate.
- No new Vue tests. No `player.ts` import from the test tree.

## Risks

- `htmlAudioSink.load` always `play()`s from 0. Seek must run after a successful `attemptPlay` (and again on first duration if the first seek was ignored). Seeking before metadata is ready is a no-op on companion and can be a no-op on HTML.
- `onPauseState` currently ignores its `paused` argument. Persist only when the sink is actually paused after `syncTransportFlags`.
- `playIndex` is also the queue-tap path. Applying resume when source is not `none` would replace “restart this song” with a jump to the last pause.

## Implementation

### Files

- Change: `frontend/src/stores/player.ts` (`onPauseState`, `initAudioListeners` pagehide/visibility, `seekToFraction`, Media Session `seekto`, `playIndex` cold-resume, pending companion flush, clear on stop/advance/end)
- Change: `frontend/src/stores/playerPrefs.ts` or `frontend/src/stores/player.ts` — export `applyPlaybackPosition()` that sets `player.currentTime` / `player.duration` from `resumeSeconds` + `pl.current`
- Change: `frontend/src/main.ts` — call `applyPlaybackPosition()` after `loadPlaylist()` (next to `applyVolume` / `applyExpanded`)
- Do not change: sink `load()` contracts (still start playback). No boot load-without-play path.

### Steps

1. `applyPlaybackPosition()`: if `resumeSeconds` for `pl.current` is non-null, set `player.currentTime` to that value; if `pl.current.duration > 0`, set `player.duration` too. Leave `playSource` as `none`. Call from `main.ts` after `loadPlaylist()`.
2. Helper `persistCurrentPosition()`: write if `pl.current.id` and finite `player.currentTime >= 0`. Use from page hide and paused seeks. Pause handler calls it only when `player.playSource` is `streaming` or `downloaded`.
3. `onPauseState`: `syncTransportFlags()` then persist per step 2.
4. In `initAudioListeners`, listen for `pagehide` and `visibilitychange` (`document.visibilityState === "hidden"`). Both call `persistCurrentPosition()`.
5. `seekToFraction`: resolve duration as sink duration if `> 0`, else `player.duration`. If `playSource === "none"`, set `player.currentTime` and persist; return. Otherwise sink seek + `onSinkTime`; persist if `activeSink.paused`. Same persist on Media Session `seekto` when paused.
6. `playIndex(index)`:
   - `const cold = player.playSource === "none"` before `beginLoad()`.
   - Compute `seekTo = cold ? resumeSeconds({ trackId: pl.tracks[index]?.id, saved: readPlaybackPosition(), duration: pl.tracks[index]?.duration }) : null`.
   - If `seekTo == null`, `clearPlaybackPosition()`.
   - After successful HTML or companion load, if `still(gen)` and `seekTo != null`, set pending `{ gen, seconds: seekTo }` and flush when `activeSink.duration > 0` (immediate and from `onDuration` / `onTime`). Flush re-runs `resumeSeconds` against sink duration, seeks if `> 0`, then `onSinkTime`.
7. `stopPlayback`: `clearPlaybackPosition()` (after stop is fine; pause persist is gated on play source).
8. `onSinkEnded`: if not repeat-one, `clearPlaybackPosition()` before `playNext()` (repeat-one keeps the slot; next pause will overwrite).

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manual (required; `player.ts` is not unit-tested):

1. Play a track, pause from the in-app button, reload. Mini-player / now-playing show the paused time. Play seeks there and does not start by itself.
2. Pause from the OS / browser media banner (or Android Now Playing). Reload. Same resume.
3. While paused, scrub, then reload. Resume is the scrubbed time, not the older pause.
4. Play, leave the tab or kill the PWA without tapping pause, reopen. Position is the last hide, not 0. Still no auto-play.
5. After media is loaded, tap the current queue row. Playback restarts at 0. Reload after that does not jump back to the previous pause.
6. Skip or let the track end, reload. The new current track starts at 0 (unless it was itself paused later).
7. Pause within 3s of the end, reload, press Play. Starts at 0.
8. Exclusive companion (if available): pause, reload, Play seeks once duration is known.

## Acceptance

- [ ] Boot shows the saved time and never auto-plays.
- [ ] First Play after restore seeks to that time (HTML and companion).
- [ ] Pause, page hide, and paused seeks all write the dedicated key.
- [ ] Already-loaded `playIndex` of the current track restarts at 0 and clears the slot.
- [ ] Stop, skip, track end, and a different-track load clear or ignore the slot so the next song does not inherit it.
- [ ] Near-end restore is 0.
