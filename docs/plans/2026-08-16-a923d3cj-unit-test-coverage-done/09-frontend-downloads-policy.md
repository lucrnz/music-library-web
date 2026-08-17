# Stage 09: Frontend downloads policy

## Status
done

## Description

Test download auto-pause reasons, play-source preference, action-kind join, and hierarchy assembly. Extract one pure `assembleDownloadsHierarchy` seam so the tree/sort logic does not need IndexedDB.

## Rationale

Queue policy and “stream vs local” are the download subsystem’s brains. Catalog/OPFS/worker stay out of scope; this stage locks the decisions those layers call.

## Invariants

- No OPFS, no IndexedDB, no `fetch`.
- `buildDownloadsHierarchy` remains the async entry used by the app; it calls the new pure assembler.
- `shouldPreferLocalOnline` stays the policy function; do not rewrite `resolvePlaySource` to make it testable.
- Mutate exported `settings` / `downloads` / `catalogIndex` only as needed; restore in `afterEach`.

## Risks

- `queuePolicy.ts` imports catalog/opfs/queue at module load. Always `vi.mock` those modules at the top of the test file — do not change production imports and do not wait to see if import fails.
- `actionKind` reads several reactive stores; tests must set `downloads.enabled`, `settings.download`, and `catalogIndex.byTrack` explicitly.
- `downloadAutoPauseReason` calls `autoPauseReason()` then `settings.onlyDownloadOnWifi` + `isConstrainedConnection()`. It does **not** call `isHardOffline` or `canReachServer`.

## Implementation

### Files

- Edit: `frontend/src/downloads/hierarchy.ts` (extract `assembleDownloadsHierarchy`)
- Create: `frontend/tests/downloads/queuePolicy.test.ts`
- Create: `frontend/tests/downloads/hierarchy.test.ts`
- Create: `frontend/tests/downloads/resolve.test.ts`
- Create: `frontend/tests/downloads/actionKind.test.ts`

### Steps

1. **Seam:** move the in-memory tree build in `buildDownloadsHierarchy` into `export function assembleDownloadsHierarchy(tracks, albums, artists): DownloadsHierarchy`. `buildDownloadsHierarchy` only `await`s the three list calls and returns `assembleDownloadsHierarchy(...)`. Same sort: disc/track, album title, artist name; `_unknown` / `_no_album` keys unchanged.
2. **queuePolicy mocks (declare at file top, no runtime fork):**
   - `vi.mock("@/connectivity")` — export a mocked `autoPauseReason`
   - `vi.mock("@/networkConstraints")` — export a mocked `isConstrainedConnection`
   - `vi.mock("@/downloads/db")`
   - `vi.mock("@/downloads/opfs")`
   - `vi.mock("@/downloads/queue")`
   - `vi.mock("@/downloads/catalog")`
   Drive `downloadAutoPauseReason`:
   - `autoPauseReason` → `"offline"` → `"offline"`
   - `autoPauseReason` → `"server"` → `"server"`
   - `autoPauseReason` → `null`, `settings.onlyDownloadOnWifi = true`, `isConstrainedConnection` → true → `"metered"`
   - `autoPauseReason` → `null` and unconstrained → `null`
3. **resolve:** `shouldPreferLocalOnline("flac_16_44100", "opus_192_48000", "prefer_offline", catalog)` true; `"prefer_stream"` false; `"prefer_better"` true when local ranks ≥ stream (use a tiny catalog of those ids).
4. **actionKind:** table of `{ enabled, track, catalog state }` → `hide` (disabled / missing id / `isMissing`), `download`, `pending`, `active`, `paused`, `retry`, `ready`, `other`. Reset store bits after each case.
5. **hierarchy:** feed two tracks (different artists; one album with disc/track order reversed) plus sparse album/artist records; assert grouping, sort, fallback titles `"Unknown album"` / `"Unknown artist"`.

### Verify

```sh
pnpm --dir frontend test
pnpm --dir frontend typecheck
```

## Acceptance

- [ ] `assembleDownloadsHierarchy` is exported and covered; `buildDownloadsHierarchy` is a thin IDB wrapper.
- [ ] Auto-pause reasons and the three playback policies are locked.
- [ ] Action-kind join covers hide/busy/ready/retry/other/download.
- [ ] No OPFS/IDB APIs are invoked.
