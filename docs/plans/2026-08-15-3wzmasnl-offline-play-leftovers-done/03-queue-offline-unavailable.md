# Stage 03: Queue unavailable + skip

## Status
done

## Description

When downloads are enabled and `!canUseRemoteMedia()`, gray queue rows that are not playable locally. `playNext` / `playPrev` / ended skip those rows. Tap still `playIndex`.

## Rationale

Transport otherwise walks into `offline_no_local`. Gray + skip makes the offline queue honest without changing explicit row taps.

## Invariants

- Gray/skip only if `downloads.enabled && !canUseRemoteMedia()`. Downloads off → no gray, no skip.
- Playable = `joinDownloadUiStatus` / `trackDownloadState` is `ready` or `other`. `none`, `failed`, `pending`, `active`, `paused` are not playable.
- Skip loops `nextIndex` / `prevIndex` (shuffle cursor advances). Cycle or `repeat=one` returning the same unplayable index → stop (do not spin).
- `repeat=all` may wrap; if a full walk finds nothing playable, stop.
- `prevIndex` `{ restart: true }` still restarts the current track (no skip).
- `playIndex(i)` from a row tap is unchanged.
- Do not change `computeNextIndex` / `peekNextIndex`.
- Do not change `pl.index` just because reachability dropped.

## Risks

- `catalogIndex` not hydrated yet: all rows look gray and Next skips to stop. First tap still tries play (IDB read in resolve). Accept; hydrate is usually fast.
- Near-end prepare may still target a gray next index (`peekNextIndex` unchanged). When `canReachServer()` is already false, prepare is skipped anyway.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/player.js` (`playNext`, `playPrev`; ended already calls `playNext`)
- Change `src/musicweb/static/js/components/playlist/PlaylistView.js`
- Change `src/musicweb/static/css/app.css` (queue `.row` lives here)
- Optionally a tiny helper next to `trackDownloadState` in `src/musicweb/static/js/downloads/catalog.js` if player and the view would otherwise duplicate `ready|other`

### Steps

1. Add `isLocallyPlayableDownload(trackId)` (or equivalent) that is true iff `trackDownloadState(trackId)` is `ready` or `other`. One owner — catalog join, not a second status table.
2. In `player.js`, helper `shouldSkipUnplayableQueue()` = `downloads.enabled && !canUseRemoteMedia()`. `playNext`: call `nextIndex` in a loop until the landing index is locally playable or stop (`playIndex` only on a playable index; if none, pause/sync as today’s empty-next). Guard with a `Set` of seen indices. `playPrev`: if `prevIndex` returns `{ restart }`, keep that; else loop backward the same way.
3. In `PlaylistView`, add a row class (e.g. `unavailable`) when `shouldSkipUnplayableQueue()` and the track is not locally playable. Keep `@click` → `playIndex`. Do not disable the menu/delete/drag.
4. CSS: dim the unavailable row (opacity on title/sub/cover is enough). Playing + unavailable may both apply (current streaming track after drop). Do not invent a second row layout.
5. Do not touch `computeNextIndex`.

### Verify

- `rg "computeNextIndex" src/musicweb/static/js/stores/playlist.js` — still download-agnostic.
- `rg "canUseRemoteMedia" src/musicweb/static/js/stores/player.js` — used by play load **and** skip.
- Manual, downloads on, server down, mixed queue: downloaded rows normal; others dim. Next/prev skip dim rows and play a download. Tap a dim row still attempts play. Repeat-all with only dim rows left stops. Downloads off: no dim, no skip.

## Acceptance

- [ ] Unreachable + downloads on: only playable OPFS rows look normal.
- [ ] Next/prev/ended skip unplayable rows; no infinite `repeat=one` loop.
- [ ] Tap still `playIndex`s the tapped index.
- [ ] Current index is not auto-advanced when reachability drops.
- [ ] Downloads disabled: queue looks and skips as today.
