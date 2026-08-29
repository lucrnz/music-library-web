# Stage 05: CD session and chrome

## Status
done

## Description

Add CD as a session occupant and chrome surface: header button, Mac-PWA fourth tab, `/cd` room, a CD cursor the playlist pane **views**, generic Audio CD art, status-line slot, and Media Session hook. No identify and no audio yet. The on-demand queue is untouched.

## Rationale

Identify and playback need a room and a disc list that cannot clobber `musicweb.playlist.v1` or break Play-all.

## Invariants

- `become("cd")` leaves radio. `become("queue"|"radio"|"none")` leaves CD: stop watch, clear the **CD** cursor (not a stash restore).
- `playlist.ts` / `musicweb.playlist.v1` never change because of CD.
- Disc list is the TOC: no remove, reorder, or add-to-this-list. Shuffle/repeat live on the CD cursor and start `off`.
- While session is `cd`, disable add-to-queue, play-next, and play-last (library menus and queue chrome). Play / Play-all still call `become("queue")` and play the library action.
- `player.ts` does not import `stores/cd.ts`. `cd.ts` does not import `player.ts`. Handoff is `become`.
- `effectiveLibraryMode` stays CD-free.
- Fourth tab and `/cd` only when `canShowCdUi()`. Guard a typed `/cd` URL the way radio is guarded.
- Opening the room does not play.
- `become("cd")` must not restore queue Media Session handlers. Suspend or install CD no-op/pause handlers until 07.

## Risks

- PlaylistView currently reads `pl.tracks`. Rendering `cd.tracks` when session is `cd` is a view switch, not a second playlist store. Do not wrap that as `cdMode` on `commit()`.

## Implementation

### Files

- `frontend/src/playback/session.ts`
- `frontend/src/playbackStatus.ts`
- `frontend/src/stores/playerState.ts`
- `frontend/src/stores/playerPrefs.ts`
- `frontend/src/stores/cd.ts`
- `frontend/src/components/cd/CdView.vue`
- `frontend/src/components/cd/CdNowPlaying.vue`
- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/src/components/playlist/queueMenuItems.ts`
- `frontend/src/components/library/trackMenuItems.ts`
- `frontend/src/components/library/albumMenuItems.ts`
- `frontend/src/components/layout/TabBar.vue`
- `frontend/src/components/App.vue`
- `frontend/src/components/player/PlayerBar.vue`
- `frontend/src/components/player/PlaybackStatusLine.vue`
- `frontend/src/components/player/NowPlayingView.vue`
- `frontend/src/router.ts`
- `frontend/index.html`
- `frontend/public/static/img/audio-cd.svg`
- `frontend/css/cd.css`
- `frontend/src/main.ts`
- `frontend/tests/playback/handoff.test.ts`
- `frontend/tests/stores/cd.test.ts`
- `frontend/tests/playlist/queueMenuItems.test.ts`
- `frontend/tests/library/trackMenuItems.test.ts`

### Steps

1. Extend `ActiveSession` with `"cd"` in `frontend/src/playback/session.ts` (`onLeaveCd`; leaving `cd` calls it). Only `radio` and `cd` suspend/replace on-demand Media Session; entering `cd` must not `restoreMediaSession()`. Extend `PlayStatusState.session` in `frontend/src/playbackStatus.ts` and `NowPlayingRail` in `playerState.ts` / persist in `playerPrefs.ts` (`toggleCdRail`).
2. On `stores/cd.ts` add the cursor: `tracks`, `index`, `shuffle`, `repeat`, room face (`no_disc | drive_missing | companion_offline | needs_setting | needs_libcdio | idle`). `enterCdMode` / `leaveCdMode` call `become`, `watchOptical(false)` until 06. `setCdTracks` writes the cursor only.
3. `PlaylistView.vue`: when `activeSession() === "cd"`, render `cd.tracks` (no drag-reorder, no remove). `playlist.ts` is not called. Queue header still hosts the CD icon next to Radio.
4. Disable add-to-queue / play-next / play-last in `queueMenuItems.ts`, `trackMenuItems.ts`, and `albumMenuItems.ts` while session is `cd`. Tests cover the hide.
5. Chrome: sprite `#i-cd` in `frontend/index.html`. Desktop icon in `PlaylistView.vue` next to Radio. `TabBar.vue` fourth tab if `canShowCdUi()`. `router.ts` `/cd` `pane: "cd"`. `App.vue` absorbs desktop `/cd` like `/radio`; mobile-width Mac PWA mounts `CdView.vue` and unmounts library+playlist. Typed `/cd` on a non-capable client does not mount CD chrome.
6. `CdNowPlaying.vue` wraps `NowPlayingView.vue` (room + compact) with empty transport and a reserved status slot plus a disabled Eject placeholder (07 wires it). Generic art: `frontend/public/static/img/audio-cd.svg`.
7. `PlaybackStatusLine.vue` uses `playbackStatus.ts` for session `cd` (icon + **No disc** etc.). Exclusive snap is not the primary face.
8. `<link rel="stylesheet" href="./css/cd.css" />` in `frontend/index.html` next to `radio.css`.
9. Register `onLeaveCd` from `main.ts`.

### Verify

```sh
pnpm --dir frontend exec vitest run tests/playback/handoff.test.ts tests/stores/cd.test.ts tests/playlist/queueMenuItems.test.ts tests/library/trackMenuItems.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Toggling CD on a Mac PWA opens the room and shows an empty/No disc list in the playlist pane. `musicweb.playlist.v1` is unchanged before and after leave.
- Play-all on a library album while CD is open becomes queue and plays **that** album, not a restored stash.
- Add-to-queue / play-next are hidden while CD is on.
- Android / Windows PWA: no tab, no header button, `/cd` does not mount the room.
- Status slot can show **No disc** with the CD icon; exclusive “Ready · device” is not the primary face while session is `cd`.
- `become("cd")` does not install queue Media Session next/prev.
