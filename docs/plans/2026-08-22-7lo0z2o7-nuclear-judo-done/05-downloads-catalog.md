# Stage 05: Downloads catalog view

## Status
done

## Description

One in-memory `DownloadsCatalogView` in `snapshot.ts`, invalidated on catalog mutation. List browse, tree roots, manager tree, and add-all share it. Do not collapse `index.ts`.

## Rationale

`loadDownloadsCatalogView` currently rebuilds hierarchy + art + packed roots on every caller. A singleton deletes three of those walks without changing the offline catalog model.

## Invariants

- Public function stays `loadDownloadsCatalogView()` (awaited). After a mutation it must return a fresh view; otherwise it may return the cached one.
- Packed `roots` use the stage-04 `TreeNode` union.
- Queue / `index.ts` / `queueRuntime` import graph is unchanged.

## Risks

- Forgetting to invalidate on orphan / art pin / wipe leaves a stale tree until reload. Invalidate from every `writer.ts` catalog mutation listed below.
- Concurrent first loads must not build twice; one in-flight promise is enough.

## Implementation

### Files

- frontend/src/downloads/snapshot.ts
- frontend/src/downloads/writer.ts
- frontend/src/downloads/addAll.ts
- frontend/src/downloads/browse.ts
- frontend/src/components/library/sources/downloadsBrowse.ts
- frontend/src/components/tree/sources/downloadsSource.ts
- frontend/src/components/downloads/DownloadsModal.vue
- frontend/tests/downloads/addAll.test.ts
- frontend/tests/downloads/snapshot.test.ts

### Steps

1. In `snapshot.ts`, import art helpers from `@/downloads/art` (not the `catalog.ts` barrel — that re-exports `writer.ts` and would cycle). Cache the last `DownloadsCatalogView` and the in-flight build. `loadDownloadsCatalogView` returns the cache when present; otherwise builds (today’s hierarchy + artUrls + typed roots) and stores it. Export `invalidateDownloadsCatalogView()` that drops cache + in-flight.
2. Call `invalidateDownloadsCatalogView` from `writer.ts` after `finalizeTrackDownload`, `deleteTrackDownload`, `deleteAlbumDownloads`, `deleteArtistDownloads`, `wipeAllDownloads`, `markTrackOrphan`, and `markTrackBroken` (any function that changes catalog rows or art pins used by the view).
3. Leave `addAll.ts`, `browse.ts`, `downloadsBrowse.loadRoots`, and `downloadsSource.loadDownloadsTree` calling `loadDownloadsCatalogView`. They must not walk IDB themselves. `addAll` uses `hierarchy` from that shared view (no second build).
4. `DownloadsModal.vue` keeps `loadDownloadsTree`; that helper stays a thin wrap of the shared view.
5. Update `addAll.test.ts` so a mocked `loadDownloadsCatalogView` is still the only catalog read. Add `snapshot.test.ts`: second `loadDownloadsCatalogView` does not rebuild; after `invalidateDownloadsCatalogView` it does.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test -- tests/downloads/addAll.test.ts tests/downloads/snapshot.test.ts tests/downloads/hierarchy.test.ts tests/library/browseSource.test.ts`

## Acceptance

- `rg -n "buildDownloadsHierarchy" frontend/src` hits only `snapshot.ts`.
- `rg -n "invalidateDownloadsCatalogView" frontend/src/downloads/writer.ts` is non-empty.
- `addAll.ts` / `browse.ts` / `downloadsBrowse.ts` / `downloadsSource.ts` call `loadDownloadsCatalogView` and do not import `buildDownloadsHierarchy`.
- `snapshot.test.ts` proves cache hit and post-invalidate miss.
- Typecheck is clean.
