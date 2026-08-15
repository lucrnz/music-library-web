# Stage 05: Removing the current queue row continues playback

## Status
done

## Description

Stop setting `pl.index = -1` when the current index is removed. After splice, the next row occupies that index (or the cursor clamps to the new last row). `removeIndices`’s existing `playIndex(pl.index)` branch becomes live.

## Rationale

Plan 017 already specified: “removing the current track plays whatever lands on that index, or stops.” The continue path is dead because `pl.removeIndices` zeros the cursor. Delete the assignment; do not add a new continue policy.

## Invariants

- Removing a non-current row still only splices and decrements `index` when the removal is before the cursor.
- Removing the only row still `stopPlayback()`.
- Edit-mode trash and menu “Remove from queue” still share this helper.
- `slotMatches` / menu close-on-mismatch unchanged.

## Risks

- Current row was last: `index === length` after splice. The existing clamp sets `length - 1` (`-1` when empty).
- The slid-in row reloads via `playIndex` (stage 02 session). Do not keep the old sink buffer.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/playlist.js`
- Do **not** change `queueMenuItems.js` / `PlaylistView.js` call sites.

### Steps

1. In `pl.removeIndices`, delete `else if (i === this.index) this.index = -1`. Still decrement when `i < this.index`. Still clamp after the loop.
2. Keep `removingCurrent` as `indices.includes(this.index)` before the splices.
3. Wrapper stays: `removingCurrent` and `pl.length && pl.index >= 0` → `playIndex(pl.index)`; else if `removingCurrent` → `stopPlayback()`.

### Verify

- `uv run --group dev pytest`
- `uv run musicweb`: queue five tracks, play index 2.
  - ⋮ → Remove on the playing row: old index 3 starts as the new index 2.
  - Play the last row, remove it: previous row starts.
  - Play the only row, remove it: stop, empty queue.
  - Remove a row above the current one: current keeps playing; `pl.index` decrements.

## Acceptance

- [x] Removing the current row with others remaining calls `playIndex` on the slid-in index.
- [x] Removing the last remaining row stops.
- [x] Non-current removals do not restart playback.
