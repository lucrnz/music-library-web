# Stage 03: BrowseSource finish

## Status
done

## Description

One downloads catalog snapshot. `BrowseSource` owns tree title, empty copy, focus path, reload keys, and the header album-download action. Hosts stop switching on `mode === "downloads"`. `BrowseTreeLoad.hierarchy` dies. BrowseSource booleans stay. Do not merge the Vue hosts. Tree nodes may still carry `downloadMeta` (stage 05 deletes it).

## Rationale

The source seam exists; the hosts never shrank. One snapshot deletes the list/tree/add-all triple build. Tree extras on the source delete the mode switches the last extract parked.

## Invariants

- One `LibraryView` for online and downloads. Stats still opts out of `load()`.
- Tree kinds stay `artist` / `album` / `track` (and online `dir` / `file`).
- Browse `artUrls` keys stay `artist:${id}:thumb` and `cover:${albumId}:thumb`.
- Downloads must not invent `/api/cover` or `/api/artist-image`.
- `entityActionsFor(source)` remains the menu `run` owner.
- `downloadMeta` may remain on nodes until stage 05.

## Risks

- Focus-path rewrite today needs `DownloadsHierarchy`. After this stage the source must resolve focus without putting `hierarchy` on `BrowseTreeLoad`.
- `DownloadsModal` copies the eager `primeChildren` walk; both callers must use the same helper.

## Implementation

### Files

- `frontend/src/downloads/snapshot.ts`
- `frontend/src/downloads/browse.ts`
- `frontend/src/downloads/addAll.ts`
- `frontend/src/components/tree/sources/downloadsSource.ts`
- `frontend/src/components/tree/treeSession.ts`
- `frontend/src/components/library/browseSource.ts`
- `frontend/src/components/library/sources/onlineBrowse.ts`
- `frontend/src/components/library/sources/downloadsBrowse.ts`
- `frontend/src/components/library/LibraryView.vue`
- `frontend/src/components/tree/LibraryTreePane.vue`
- `frontend/src/components/downloads/DownloadsModal.vue`
- `frontend/src/components/library/loaders.ts`
- `frontend/src/components/tree/sources/foldersSource.ts`
- `frontend/tests/library/browseSource.test.ts`
- `frontend/tests/downloads/addAll.test.ts`
- `frontend/tests/downloads/hierarchy.test.ts`

### Steps

1. Add `frontend/src/downloads/snapshot.ts` exporting `loadDownloadsCatalogView()` that builds hierarchy once, fills `artUrls` once, and packs pre-primed `roots` (today’s `loadDownloadsTree` body). Return `{ hierarchy, artUrls, roots }`.
2. `frontend/src/downloads/browse.ts` maps `hierarchy` + `artUrls` → `LibraryPage`. `frontend/src/components/tree/sources/downloadsSource.ts` `loadDownloadsTree` returns the snapshot’s `roots` + `artUrls` (no `hierarchy` field). `frontend/src/downloads/addAll.ts` uses `hierarchy` from the snapshot (or the snapshot’s artists/albums) — do not call `buildDownloadsHierarchy` a second time.
3. Add `primePackedTree(session, roots)` on `frontend/src/components/tree/treeSession.ts` (today’s eager artist→album walk). `LibraryTreePane` and `DownloadsModal` call it. They do not inspect `packed.hierarchy`.
4. On `BrowseSource` add `treeTitle(mode)`, `emptyTreeMessage({ downloadsEnabled })`, `resolveFocusPath(path)`, `treeReloadKeys()`. Downloads source keeps last snapshot privately so `resolveFocusPath` can call today’s `resolveDownloadsFocusPath` without leaking `DownloadsHierarchy` onto `BrowseTreeLoad`. Online `resolveFocusPath` is identity; `treeReloadKeys` is `[]`; `emptyTreeMessage` is `"Nothing here yet"`; `treeTitle` is Artists / Albums / Folders. Delete `hierarchy?` from `BrowseTreeLoad`.
5. `LibraryTreePane` uses `source.emptyTreeMessage`, `source.resolveFocusPath`, `source.treeReloadKeys`, and `primePackedTree`. Delete every `props.mode === "downloads"` for empty copy, focus, prime, and catalog-reload.
6. `LibraryView.applyTreeChrome` uses `source.treeTitle(mode)`. Header Download pill calls `source.albumDownload` with the current album id (not `downloadCurrentAlbum(tracks)`). Delete the mode switch inside `applyTreeChrome`.
7. One `browseFolder(path)` used by `loaders.ts` `loadFolders` and `foldersSource.ts` `listFolderChildren`: `GET /api/browse` + `fetchTracksMeta` + `FileRowModel` once. List wraps it; tree maps files to leaf nodes.

### Verify

- `pnpm --dir frontend test -- frontend/tests/library/browseSource.test.ts frontend/tests/downloads/addAll.test.ts frontend/tests/downloads/hierarchy.test.ts frontend/tests/tree/flattenVisible.test.ts frontend/tests/tree/downloadsMenuMap.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "mode === \\\"downloads\\\"|hierarchy\\?" frontend/src/components/tree/LibraryTreePane.vue frontend/src/components/library/browseSource.ts` is empty
- `rg -n "downloadCurrentAlbum" frontend/src/components/library/LibraryView.vue` is empty
- `rg -n "buildDownloadsHierarchy" frontend/src/downloads/browse.ts frontend/src/components/tree/sources/downloadsSource.ts frontend/src/downloads/addAll.ts` is empty

## Acceptance

- List, tree, manager, and add-all share one snapshot function.
- `BrowseTreeLoad` has no `hierarchy`.
- `LibraryTreePane` does not switch on mode for empty copy, focus, prime, or reload.
- Header album-download goes through `source.albumDownload`.
- Online folder list and folder tree share one browse join.
- BrowseSource booleans and the two Vue hosts remain. Visible browse behavior is unchanged.
