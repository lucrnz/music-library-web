# Stage 02: Playlist advanceToPlayable

## Status
done

## Description

Extract `stepNext` / `stepPrev` as the only cursor-advance implementation. `nextIndex` / `prevIndex` walk and `advanceToPlayable` all call them. Delete the mutating skip walks in `player.js`.

## Rationale

Skip is queue-cursor policy. Using `pl.index` as a loop variable flashes `.playing` and duplicates next/prev. Re-describing wrap/rebuild on a clone would fork the shuffle machine — that fails the bar. One step function deletes both the play-head search and the second algorithm.

## Invariants

- `computeNextIndex` / `peekNextIndex` stay download-agnostic peeks.
- `stepNext` / `stepPrev` are the only functions that advance or rebuild shuffle. `nextIndex` / the non-restart half of `prevIndex` are thin wrappers: `stepNext(this)` / `stepPrev(this)`.
- Same 027 skip rules: only when `downloads.enabled && !canUseRemoteMedia()`; playable = `isLocallyPlayableDownload`; `repeat=one` on an unplayable landing stops (seen-set / same-index); `repeat=all` wrap once; miss restores nothing (current index unchanged).
- `playPrev` restart (`currentTime > 3`) still uses `prevIndex(currentTime)` and seek — walker not involved.
- No assignment to `pl.index` / `pl.shufflePos` except the final commit of a successful landing (plus `playIndex` as today).

## Risks

- Shuffle `repeat=all` wrap rebuilds order **inside `stepNext`**. The clone goes through that same function; commit includes `shuffleOrder` when the landing rebuilt it.
- Linear `prev` at start returns the same index today. Walker must treat “step landed on start and unplayable, no wrap” as miss, not an infinite stay.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/playlist.js`
- Change `src/musicweb/static/js/stores/player.js`

### Steps

1. In `playlist.js`, add file-local `stepNext(cursor)` and `stepPrev(cursor)` that mutate the record and return the landing index or `-1`. Move **all** of today’s `nextIndex` body (empty-order rebuild, `computeNextIndex`, wrap rebuild, `shufflePos++`) into `stepNext`. Move the non-restart `prevIndex` walk (shuffle back / linear / wrap) into `stepPrev`. Do not leave a second copy of those branches on `pl`.
2. `pl.nextIndex()` → `return stepNext(this)`. `pl.prevIndex(t)`: if `t > 3` return `{ restart, index }` as today; else `return stepPrev(this)`.
3. `pl.advanceToPlayable(dir, isPlayable)`: shallow-clone the cursor (`shuffleOrder` slice). Loop `stepNext` or `stepPrev` on the clone while `!isPlayable(tracks[idx])`; stop on `-1` or a `Set` of seen indices. On a playable landing, assign `index`, `shufflePos`, `shuffleOrder` from the clone onto `pl` and return the index. On miss, write nothing; return `-1`. No wrap/rebuild code in this method.
4. Delete `nextPlayableIndex`, the prev walk, and save/restore of `pl.index` from `player.js`.
5. `playNext`: skip predicate → `advanceToPlayable('next', …)`; else `nextIndex()`. Then play-or-stop.
6. `playPrev`: restart branch first. Then skip → `advanceToPlayable('prev', …)` else `prevIndex(0)`. Never `prevIndex` plus a second walk.
7. Keep `stopAtQueueEnd` if it still de-dupes the pause paths.

### Verify

- `rg "pl.index = first|savedShufflePos" src/musicweb/static/js/stores/player.js` — no matches.
- `rg "function stepNext|function stepPrev" src/musicweb/static/js/stores/playlist.js` — both exist; wrap/rebuild only appears in those bodies.
- `rg "rebuildShuffle|shufflePos \\+=" src/musicweb/static/js/stores/playlist.js` — only inside `stepNext` / `stepPrev` / the existing `rebuildShuffle` helper (not inside `advanceToPlayable`).
- `rg "advanceToPlayable" src/musicweb/static/js` — defined on playlist; used from `playNext` / `playPrev` only.
- `rg "computeNextIndex" src/musicweb/static/js/stores/playlist.js` — still no downloads import.
- Manual: mixed queue, downloads on, unreachable — Next/Prev skip gray rows, no playing-highlight flicker through them; tap still plays a gray row; wrap with all gray stops; restart-after-3s prev unchanged.

## Acceptance

- [ ] One step implementation: `nextIndex` / `prevIndex` walk / skip clone all call `stepNext`/`stepPrev`.
- [ ] `advanceToPlayable` contains no wrap/rebuild of its own.
- [ ] Skip does not mutate the play-head until a playable landing exists.
- [ ] `computeNextIndex` remains pure and download-free.
- [ ] 027 skip/tap/restart behavior unchanged.
