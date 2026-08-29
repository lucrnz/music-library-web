# Stage 07: CD playback

## Status
done

## Description

Play the virtual per-track WAV through the companion sink with an explicit `hog` flag. Transport lives on the CD cursor (`cdLoad.ts`), not `playIndex`. Status Reading → Playing. Eject button. Exclusive toggle reloads at the same position.

## Rationale

Chrome and identify are hollow until the laser moves. This is the deck.

## Invariants

- Session `cd` loads only the loopback `/cdda/` URL via `playback/cdLoad.ts`. Never HTML. Never `/api/stream`. Never `playIndex` / `loadResolved`.
- `companionSink.load(url, { hog: exclusiveArmed })`. No `/cdda/` path sniff. Exclusive on + unarmed hard-fails (toast + Settings on `exclusive_needs_device`). Exclusive off → `hog: false` (stage 02 hub contract).
- Ignore `upsample_device`. Profile tag is `cdda`. `PlaySourceState` includes `cd` (see `playBlock.ts` / `playbackStatus.ts`).
- Eject control: stop transport, `ejectOptical`, then media-gone (clear cursor, **No disc**, stay in `cd`). Ioctl failure: already stopped; toast; keep paused list if media still present.
- Media-gone / swap without the button: same clear; do not leave CD; do not mutate the on-demand queue.
- Stop / Media Session stop = pause; stay in CD.
- Leave (CD button / library Play / Tune-in): stop sink, clear cursor, watch off.
- Exclusive toggle mid-CD: reload current URL at the same position with the new `hog` flag (hard-fail if turning on unarmed).
- Shuffle/repeat start `off`. Disc order is fixed.

## Risks

- `playIndex` still `become("queue")`. CD rows must never go through it. Playlist pane click on a CD row calls `cdLoad`.
- Companion 60 s idle TTL: a loaded CD WAV must count as loaded (already true for any mpv load).

## Implementation

### Files

- `frontend/src/playback/cdDelivery.ts`
- `frontend/src/playback/cdLoad.ts`
- `frontend/src/playback/session.ts`
- `frontend/src/playback/sinks/companionSink.ts`
- `frontend/src/playback/sinks/types.ts`
- `frontend/src/exclusive/companionClient.ts`
- `frontend/src/playBlock.ts`
- `frontend/src/playbackStatus.ts`
- `frontend/src/stores/cd.ts`
- `frontend/src/main.ts`
- `frontend/src/exclusive/opticalClient.ts`
- `frontend/src/components/cd/CdNowPlaying.vue`
- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/src/components/player/PlaybackStatusLine.vue`
- `frontend/src/components/player/PlaybackDetailsBody.vue`
- `frontend/tests/playback/cdDelivery.test.ts`
- `frontend/tests/playback/cdLoad.test.ts`
- `frontend/tests/playback/handoff.test.ts`

### Steps

1. `cdDelivery.ts`: given port, token, device id, track number → absolute loopback URL. Pure. Rejects if any piece is missing (`cd_not_ready` in `playBlock.ts`).
2. `cdLoad.ts`: `become("cd")`, `companionSink.load(url, { hog: isExclusiveArmed() })`, set play source `cd` / profile `cdda`, face **Reading** until first duration/time-pos, then **Playing**. Time/seek/pause/next/prev operate on the CD cursor. Do not import `player.ts`. `companionSink.ts` accepts the `hog` option and passes it on the load message; when `hog` is true keep `ensurePreferredDevice`.
3. Widen `PlaySourceState` in `playBlock.ts` and `playbackStatus.ts` with `cd`. Compact face stays the CD stage. Details may list 16/44.1 and exclusive device when armed.
4. `CdNowPlaying.vue`: play/pause/prev/next/seek/shuffle/repeat on the cursor. Eject button enabled when media is present and this tab is controller. Media Session: install CD handlers (play/pause/prev/next/seek/stop=pause).
5. `PlaylistView.vue` row activate while session is `cd` calls `cdLoad` for that cursor index, not `playIndex`.
6. `optical_media` `present=false` or drive-missing while session is `cd`: stop sink, clear cursor, **No disc** / **Drive missing**.
7. Watch exclusive enabled / armed from the same boot listener pattern as radio: `initCdListeners` in `stores/cd.ts`, registered from `frontend/src/main.ts`. Reload current CD URL at the previous position when the hog flag changes.
8. Tests: URL builder; `cdLoad` does not call `become("queue")`; leave via `become("queue")` clears the CD cursor and does not rewrite `playlist.v1`; sink load is invoked with `hog: false` when exclusive is off.

### Verify

```sh
pnpm --dir frontend exec vitest run tests/playback/cdDelivery.test.ts tests/playback/cdLoad.test.ts tests/playback/handoff.test.ts
pnpm --dir frontend typecheck
```

Manual: exclusive on — hog, 16/44.1, skip/seek. Exclusive off — default output, still mpv, not Chrome. Toggle exclusive mid-track — same position, new device policy. Eject — tray opens / disc unmounts, **No disc**, library queue unchanged. Scratch: brief **Reading**, no track skip.

## Acceptance

- Play on a CD row starts sound from the drive through mpv with no file under the companion data dir and no `playIndex` call.
- Next/prev/seek/shuffle/repeat work on the CD cursor. Leave CD shows the existing on-demand queue.
- Exclusive off does not require a hog device. Exclusive on still hard-fails if unarmed.
- Eject stops and requests tray eject; failure toasts without leaving CD.
- Stop / headset Stop pauses and stays in CD.
- `player.ts` is not grown with a CD play entry.
