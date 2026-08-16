# Stage 04: Extract playerSession and playerPrefs

## Status
done

## Description

Move cover/Media Session metadata to `playerSession.js` and expanded/volume **storage** to `playerPrefs.js`. Both import `playerState.js`, not `player.js`.

## Rationale

These are the remaining non-load chunks in `player.js`. After the walker is gone and state is separate, this extract actually shrinks the load file.

## Invariants

- `playHtml` / `playExclusive` / `playIndex` / sink wiring stay in `player.js`.
- `updatePositionState` and Media Session **action handlers** stay in `player.js` (they need `activeSink` / `playNext`).
- `setVolume` / `applyVolume` still apply to `activeSink` in `player.js`. Prefs expose persist/read helpers only — not pass-through `setVolume` wrappers that call back into the player.
- `playerSession.js` and `playerPrefs.js` do not import `player.js`.

## Risks

- Cover generation tokens (`coverResolveGen`, `lastCoverTrackId`) must move with `updateMediaSession` or stale-await breaks. Move them into `playerSession.js`.
- `refreshPlayerCovers` becomes a one-line re-export or callers import session — prefer `player.js` re-export this plan so `main.js` stays stable.

## Implementation

### Files

- Create `src/musicweb/static/js/stores/playerSession.js`
- Create `src/musicweb/static/js/stores/playerPrefs.js`
- Change `src/musicweb/static/js/stores/player.js`
- Change `src/musicweb/static/js/main.js` only if you drop re-exports (not required)

### Steps

1. `playerSession.js`: `updateMediaSession`, `clearCovers`, `refreshPlayerCovers`, cover gens. Import `player` from `playerState.js`, `pl` from `playlist.js`, `canUseRemoteMedia`, `resolveCoverUrl`, `coverUrl`, `downloads`. `player.js` imports `updateMediaSession` / `refreshPlayerCovers` from here (no cycle: session does not import `player.js`).
2. `playerPrefs.js`: `VOLUME_STORAGE_KEY`, `EXPANDED_STORAGE_KEY`, `readVolume` / `writeVolume`, `readExpanded` / `writeExpanded`, and `setExpanded` / `applyExpanded` if they only touch `player` + `pl` + localStorage. `player.js` `setVolume` / `applyVolume` call the storage helpers then `activeSink.setVolume`.
3. Delete the moved functions from `player.js`. Keep `initAudioListeners` action-handler wiring.

### Verify

- `rg "updateMediaSession" src/musicweb/static/js/stores/player.js` — import or call only, no function body.
- `rg "from \"./player.js\"" src/musicweb/static/js/stores/playerSession.js src/musicweb/static/js/stores/playerPrefs.js` — no matches.
- `wc -l src/musicweb/static/js/stores/player.js` — well under 900 (expect ~750 or less).
- Manual: volume persist, expanded persist, covers on play, Media Session metadata still set; action buttons still next/prev/play.

## Acceptance

- [ ] Covers/MS metadata live in `playerSession.js` importing `playerState.js`.
- [ ] Volume/expanded keys live in `playerPrefs.js`.
- [ ] No `player.js` ↔ session/prefs import cycle.
- [ ] Loaders remain in `player.js`.
- [ ] Chrome persist and covers behave as today.
