# Stage 01: Player fail + volume

## Status
done

## Description

Collapse `failNotice` into `failCurrentLoad`. Watch `player.volume` and apply the active sink. Delete `refreshPlayerCovers`. One offline-unplayable helper for queue skip and the playlist row.

## Rationale

The fail host and the volume writer are the leftover forks inside `player.ts`. Deleting them first means later stages do not grow a third fail path or a second volume apply.

## Invariants

- Unavailable loads still toast exclusive failures without a title prefix and still open Settings on `exclusive_needs_device`. Other blocks still prefix `Title:`.
- `applyIntent` remains the only `setPlaySourceState` writer.
- Radio still does not import `player.ts`. Radio’s existing `player.volume` watch still applies to radio audio.
- `playNext` / `playPrev` still skip to a locally playable download when downloads are on and remote media is unusable.

## Risks

- Sink `onError` and `loadResolved` unavailable must keep today’s toast vs no-toast split after the merge.
- A volume watch that also fires during `selectSink` must not loop (watch writes sink only, never `player.volume`).

## Implementation

### Files

- `frontend/src/stores/player.ts`
- `frontend/src/stores/playerPrefs.ts`
- `frontend/src/stores/playerSession.ts`
- `frontend/src/main.ts`
- `frontend/src/playBlock.ts`
- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/tests/playback/playBlock.test.ts`
- `frontend/tests/stores/playerPrefs.test.ts`

### Steps

1. In `frontend/src/stores/player.ts`, delete `failNotice`. Route `loadResolved` unavailable and every sink/`attemptPlay` failure through `failCurrentLoad({ reason, message?, toast? })`. Derive exclusive toast (no title prefix) and Settings-on-`exclusive_needs_device` from `reason` once. Emit `player.load.fail` on every fail path. Replace `player.playNotice = null` with `setPlayNotice(null)`.
2. In `initAudioListeners`, `watch(() => player.volume, (v) => activeSink.setVolume(v))`. `setVolume` calls only `setOutputVolume`. Keep `selectSink` applying volume on a real sink change. In `frontend/src/stores/playerPrefs.ts`, document that sinks subscribe to `player.volume` (on-demand watch in `player.ts`; radio already watches).
3. Delete `refreshPlayerCovers` from `frontend/src/stores/playerSession.ts`. In `frontend/src/main.ts`, call `updateMediaSession` after `initDownloads`.
4. Add `isOfflineUnplayable(trackId, { downloadsEnabled, canUseRemote })` in `frontend/src/playBlock.ts`. Use it from `playNext` / `playPrev` (platform `canUseRemoteMedia` + `downloads.enabled`) and from `PlaylistView.rowUnavailable` (`connectivity.canUseRemote` + `downloads.enabled`). Keep `advanceToPlayable` + `isLocallyPlayableDownload` as the cursor predicate.
5. Extend `frontend/tests/playback/playBlock.test.ts` for the helper. Update `frontend/tests/stores/playerPrefs.test.ts` if it asserts `setVolume` applies a sink.

### Verify

- `pnpm --dir frontend test -- frontend/tests/playback/playBlock.test.ts frontend/tests/playback/playIntent.test.ts frontend/tests/playback/teardown.test.ts frontend/tests/stores/playerPrefs.test.ts frontend/tests/playback/handoff.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "function failNotice|refreshPlayerCovers" frontend/src frontend/tests` is empty
- `rg -n "player\\.playNotice =" frontend/src/stores/player.ts` is empty

## Acceptance

- `failNotice` is gone. Unavailable `loadResolved` and sink errors call `failCurrentLoad`. Exclusive vs title-prefix is decided once.
- `setVolume` does not call `activeSink.setVolume`. `initAudioListeners` watches `player.volume` and does.
- `refreshPlayerCovers` is gone. Boot calls `updateMediaSession`.
- `playNext` / `playPrev` and `PlaylistView.rowUnavailable` share `isOfflineUnplayable`.
