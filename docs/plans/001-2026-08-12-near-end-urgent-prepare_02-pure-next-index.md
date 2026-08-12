# Stage 02: Pure next-index computation

## Status
done

## Description

Make queue “what plays next” a single pure computation. `peekNextIndex()` becomes the non-mutating view; `nextIndex()` advances shuffle (and only then rebuilds) from that same rule set. Preserve existing advance behavior for repeat modes and shuffle wrap.

## Rationale

Near-end prepare must peek without mutating shuffle. Duplicating the full next-index decision tree next to `nextIndex()` will drift. One pure source of truth keeps prepare and playNext aligned and makes edge cases (repeat one, shuffle end, repeat-all reshuffle) explicit.

## Implementation

- In `src/musicweb/static/js/stores/playlist.js` on `pl`:
  - Prefer a pure helper (method or free function) that, given current `tracks` / `index` / `shuffle` / `shuffleOrder` / `shufflePos` / `repeat`, returns the next index or `-1` when unknown (e.g. shuffle wrap that would require a fresh random order).
  - `peekNextIndex()`: return that pure result only (no `shufflePos` / `rebuildShuffle` side effects).
  - `nextIndex()`: if shuffle order is empty, keep today’s rebuild-on-advance behavior; otherwise use the pure result, then apply cursor mutation (`shufflePos++`, rebuild only when advancing past the end under `repeat === "all"` as today).
- Document the intentional peek gap: when the next track is unknown until reshuffle, peek returns `-1` and near-end prepare skips (stage 04).
- Manual check: linear next, shuffle next, repeat all wrap, repeat one, end-of-queue without repeat.
