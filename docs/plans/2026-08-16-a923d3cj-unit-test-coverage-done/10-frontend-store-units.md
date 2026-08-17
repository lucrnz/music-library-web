# Stage 10: Frontend store units

## Status
done

## Description

Test playlist queue/repeat/shuffle and settings codec/policy persistence. Export `computeNextIndex`. Do not test `player.ts` loaders or sinks.

## Rationale

Queue cursor bugs (repeat one vs all, shuffle wrap) are user-visible and currently untested. Settings persistence is the other store that is policy-heavy and localStorage-only.

## Invariants

- Node project + stage 02 storage stub. Clear `localStorage` in `beforeEach` and reset `pl` / `settings` to a known empty/default state.
- Export `computeNextIndex` only. Do not export `stepNext` / shuffle RNG.
- `vi.mock("@/api")` with inert `apiGet` / `requestPrepare` so importing the stores does not fetch. Do not call `fetchSavedPlaylists` / `loadCodecs`.
- No player sink mocks. Do not assign `settings.constrained` (`getActiveStreamCodec` ignores it).

## Risks

- `playlist.ts` and `settings.ts` import `@/api` and other stores at module load. Use `vi.mock("@/api", ...)` with inert `apiGet`/`requestPrepare` so importing the store does not fetch.
- Module-level `reactive` state is a singleton: tests must not leak queue contents.
- Shuffle uses `Math.random`. Prefer `computeNextIndex` table tests (deterministic) plus one `pl.rebuildShuffle()` test that only asserts `shuffleOrder` is a permutation of `0..n-1`.

## Implementation

### Files

- Edit: `frontend/src/stores/playlist.ts` (export `computeNextIndex`)
- Create: `frontend/tests/stores/playlist.test.ts`
- Create: `frontend/tests/stores/settings.test.ts`

### Steps

1. Change `function computeNextIndex` to `export function computeNextIndex`. No other production edits.
2. **computeNextIndex table:** empty → -1; repeat `one` → current index; linear next; last + `repeat: "all"` → 0; last + `off` → -1; shuffle uses `shuffleOrder[shufflePos+1]`; shuffle past end → -1.
3. **pl public API:** add two fake `Track`s (`id` required); `removeIndices`; `reorder`; `clear`. After add, `commit()` writes `localStorage` key `musicweb.playlist.v1`. `loadPlaylist()` reads that key back into `pl`. Reset `pl` in `beforeEach`.
4. **next/prev:** set `repeat` and call `pl.nextIndex()` / `pl.prevIndex(0)` for off/one/all on a 3-track cursor.
5. **settings persist:** seed `settings.options` with tags `{ id: "opus_192_48000" }` and `{ id: "flac_16_44100" }` (setters no-op unless the tag is already in `options` and different from the current value). `setPlaybackPolicy("prefer_stream")` writes `musicweb.playbackPolicy`. `setDownloadCodec("flac_16_44100")` writes `musicweb.downloadCodec`. `setStreamWifi("flac_16_44100", { tracks: [], index: 0, playIndex: () => {} })` writes `musicweb.streamCodec`. Assert the keys only — do not call private `loadPrefs` or `loadCodecs`.
6. **getActiveStreamCodec:** `vi.mock("@/networkConstraints")`. When `canDetectConnectionType()` is false **or** `isConstrainedConnection()` is false → `settings.streamWifi`. When both true and `settings.streamCellular` is a non-empty id → that cellular id. When both true and cellular is null/empty → wifi.

### Verify

```sh
pnpm --dir frontend test
pnpm --dir frontend typecheck
```

Also run `uv run --group dev pytest` once at the end of this stage to confirm nothing in the backend tree was touched accidentally.

## Acceptance

- [ ] `computeNextIndex` is exported and table-tested for off/one/all and shuffle peek.
- [ ] Playlist add/remove/reorder/persist work under the node storage stub.
- [ ] Settings persist writes the three `musicweb.*` keys; `getActiveStreamCodec` uses mocked `canDetectConnectionType` / `isConstrainedConnection`, not `settings.constrained`.
- [ ] `player.ts` is not imported by these tests.
