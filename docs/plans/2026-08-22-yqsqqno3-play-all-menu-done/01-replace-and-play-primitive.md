# Stage 01: Replace-and-play primitive

## Status
done

## Description

Add a playlist `replaceQueue` that swaps the session queue for a resolved playable set (or no-ops), and a player `playAllTracks` that clears the resume slot and starts index 0.

## Rationale

Every Play all surface must share one mutation so forget, prepare, shuffle cursor, and “empty collect does not wipe” cannot fork per menu. The store is the dependency; UI comes next.

## Invariants

- `playlist.ts` does not import `player.ts`.
- `replaceQueue` uses the same entry resolution and playable filter as `addToQueue` (full `Track`, bare id, `{ id }`; drop missing / no id).
- Zero playable tracks: return `false`; do not call `pl.clear`, `requestForget`, `prepareTracks`, or `commit`.
- Non-empty: `requestForget(idsLeavingQueue(oldIds, newTracks))` only. Then `pl.clear()`, `pl.add(playable)`, `commit()`, `prepareTracks(playable, { replace: true })`, return `true`.
- `playAllTracks` calls `clearPlaybackPosition()` before `replaceQueue`. On `true` it calls `playIndex(0)`. On `false` it does not call `playIndex` and does not stop playback.
- `playIndex(0)` remains the only session handoff (`become("queue")`). Shuffle, if on, keeps using `pl.add`’s rebuilt order and starts at index 0.

## Risks

- Duplicating `addToQueue`’s resolve loop will drift. Extract a shared internal resolver and keep both public functions thin.
- `prepareTracks(..., { replace: true })` is stronger than `addToQueue`’s append prepare. That is intentional for a full swap; do not reuse `addToQueue` after `clearPlaylist` (that forgets overlapping ids and does not pass `replace`).

## Implementation

### Files

- `frontend/src/stores/playlist.ts`
- `frontend/src/stores/player.ts`
- `frontend/tests/stores/playlist.test.ts`

### Steps

1. In `frontend/src/stores/playlist.ts`, extract the `addToQueue` resolve + playable filter into a shared helper used by both `addToQueue` and the new export. Do not change `addToQueue`’s append / prepare-without-replace behavior.
2. Add `export async function replaceQueue(entries): Promise<boolean>` per Invariants. Snapshot current ids before `pl.clear`. `pl.add` is what rebuilds shuffle.
3. In `frontend/src/stores/player.ts`, add `export async function playAllTracks(entries)` that `clearPlaybackPosition()`, `await replaceQueue(entries)`, and `playIndex(0)` only when replace returned `true`.
4. In `frontend/tests/stores/playlist.test.ts`, cover: empty / all-missing input leaves `pl.tracks` and does not `requestForget`; swap forgets only ids that left; overlapping ids are not forgotten; after a successful replace the tracks are exactly the new playable set and `prepareTracks` was called with `{ replace: true }`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/stores/playlist.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- `replaceQueue` is the only queue-swap primitive; it is independently testable.
- Empty input is a no-op; a successful swap forgets leavers only and prepares the new set with `replace: true`.
- `playAllTracks` is a thin player wrapper: resume slot cleared, then `playIndex(0)` iff the queue changed.
- `pnpm --dir frontend typecheck` passes.
