# Stage 06: CD transport honesty

## Status
done

## Description

Wire volume, Media Session metadata/position, exclusive reload-at-position, covers, library Play, and leftover queue-add holes so the Mac PWA deck matches the session that is actually playing.

## Rationale

CD uses a second companion sink. Volume, OS Now Playing, and the queue Play path still talk to `player.ts`. Exclusive toggle seeks before duration exists, so it always restarts. Identified covers hit a URL the server does not serve.

## Invariants

- `player.ts` still does not import `cd.ts`. Volume is a `subscribeOutputVolume` on the CD sink (same registry as radio).
- Media Session handlers stay the CD set while session is cd. Metadata comes from the CD cursor, not `pl.current`.
- `hog` is still `isExclusiveEnabled()`. Unarmed exclusive still hard-fails.
- Unknown / no-cover rows use `/static/img/audio-cd.svg`, never `/api/cover?track_id=cd:unknown:`.

## Risks

- `reloadCdAtPosition` must wait for a duration event (or a small helper on the sink) before `seek`. Do not busy-loop; subscribe to the next `onTime` with duration.
- `playOrQueueTrack` using `player.paused` is wrong while CD owns that flag. Leave CD and start the library row.

## Implementation

### Files

- `frontend/src/playback/cdLoad.ts`
- `frontend/src/playback/sinks/companionSink.ts`
- `frontend/src/stores/playerSession.ts`
- `frontend/src/playbackStatus.ts`
- `frontend/src/components/cd/CdNowPlaying.vue`
- `frontend/src/components/cd/CdMini.vue`
- `frontend/src/components/cd/CdTrackList.vue`
- `frontend/src/components/library/rows.ts`
- `frontend/src/components/library/artistMenuItems.ts`
- `frontend/src/components/library/LibraryView.vue`
- `frontend/tests/library/playOrQueue.test.ts`
- `frontend/tests/playback/cdLoad.test.ts`
- `frontend/tests/playback/playbackStatus.test.ts`
- `frontend/tests/library/artistMenuItems.test.ts`
- `frontend/tests/library/trackMenuItems.test.ts`

### Steps

1. `initCdListeners`: `subscribeOutputVolume` → CD sink `setVolume`. `cdLoad` applies `player.volume` after a successful load. `CdNowPlaying` / `CdMini` handle `@volume` via `setOutputVolume`.
2. After CD load / track change, write `navigator.mediaSession.metadata` from the CD row (title/artist/album, `audio-cd.svg` or `coverUrl` artwork). Update `playbackState` and `setPositionState` from the CD sink `onTime`. Do not call queue `updateMediaSession` while session is cd.
3. `reloadCdAtPosition`: after `load`, seek only once `duration > 0` (sink `onTime` or a one-shot waiter). Restore pause. Test asserts `seek` was called with the previous seconds (give the mock a duration after load).
4. `CdNowPlaying` cover uses `coverUrl(track, …)` when `albumId` is set; otherwise `audio-cd.svg`. `applyCdDto` may set `albumId` whenever the DTO has an `album_id` (cover still falls back if CAA is missing). `CdTrackList` uses `audio-cd.svg` when `coverUrl` would be a `cd:unknown:` track id.
5. `playOrQueueTrack`: if session is cd, `become("queue")` then `playIndex` the new row (Play leaves). `queueActionsAllowed()` also hides artist Add all and the library header Add all pill (`showAddAll && queueActionsAllowed()`).
6. `exclusiveSessionOn` includes `"cd"` so details can show the hog device. When `playProfileId==="cdda"`, details list Source CD, 16-bit, 44.1 kHz from the track (do not require a codec-catalog row).
7. Tests: hog reload seeks after duration; CD details include Source CD and 16/44.1; artist Add all omitted while session is cd; `playOrQueue.test.ts` asserts a CD session + non-empty queue + `player.paused===false` still leaves and plays the tapped row.

### Verify

```sh
pnpm --dir frontend exec vitest run tests/playback/cdLoad.test.ts tests/playback/playbackStatus.test.ts tests/library/artistMenuItems.test.ts tests/library/trackMenuItems.test.ts tests/library/playOrQueue.test.ts
```

## Acceptance

- Dragging volume in the CD room or mini changes mpv volume. Boot volume applies on the first CD load.
- macOS Now Playing / Media Session title is the CD row. Seek/position update while playing.
- Exclusive on/off mid-track resumes at the previous seconds once duration is known.
- Identified covers load through `GET /api/cover?album_id=`. Unknown rows show `audio-cd.svg`.
- Library row Play leaves CD and plays that track. Add all is hidden while CD is on.
- Playback details say CD and 16/44.1; exclusive hog copy may appear when exclusive is on.
