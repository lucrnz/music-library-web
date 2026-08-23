# Stage 01: Strip Folders from the SPA

## Status
done

## Description

Remove Folders as a client browse mode. Artists becomes home. Delete folder/file rows, menus, tree source, and multi-select. Shared browse types keep only catalog kinds.

## Rationale

The SPA is the only caller of `/api/browse` and `/api/collect`. Until the chip, route, loaders, and `collectTracks` are gone, the server cannot drop those endpoints without a live client still hitting them.

## Invariants

- `/` redirects to `/artists`. There is no `folders` route name.
- `effectiveLibraryMode` and `libraryMode` / `snapRoute` / `rememberLibraryRoute` fallbacks are `"artists"`, never `"folders"`.
- ModeBar chips are Artists, Albums, Search, Stats, and (when enabled) Downloads — no Folders.
- `BrowseSource`, `OpenMenu`, `LibraryBody`, and `TreeNode` have no folder/file/dir members. `folderPath` is not a location field.
- `libSelected`, `toggleLibSelection`, `clearLibSelection`, and Add selected are gone.
- Artists / Albums / Search / Stats / Downloads list, grid, and tree still load through the same hosts.

## Risks

- `BrowseLoc` / chrome flag removal will miss a constructor if a test fixture still passes `folderPath` or `showFolderSelection`.
- `modeRootLocation`’s default today is Folders. After this stage the default must be Artists so tree coerce cannot emit `{ name: "folders" }`.
- `kind: "dir"` fixtures in `flattenVisible` tests will fail typecheck once that member is removed.

## Implementation

### Files

- `frontend/src/router.ts`
- `frontend/src/components/layout/ModeBar.vue`
- `frontend/src/components/library/browseMode.ts`
- `frontend/src/stores/ui.ts`
- `frontend/src/components/tree/treeNavigation.ts`
- `frontend/src/components/library/useLibraryLocation.ts`
- `frontend/src/components/library/browseChrome.ts`
- `frontend/src/components/library/browseSource.ts`
- `frontend/src/components/library/sources/onlineBrowse.ts`
- `frontend/src/components/library/sources/downloadsBrowse.ts`
- `frontend/src/components/library/loaders.ts`
- `frontend/src/components/library/LibraryView.vue`
- `frontend/src/components/library/EntityListHost.vue`
- `frontend/src/components/library/entityActions.ts`
- `frontend/src/components/library/entityMenu.ts`
- `frontend/src/components/library/libraryActions.ts`
- `frontend/src/components/library/trackMenuItems.ts`
- `frontend/src/components/library/folderMenuItems.ts`
- `frontend/src/components/library/rows/FileRow.vue`
- `frontend/src/components/library/rows/FileCard.vue`
- `frontend/src/components/library/rows/FolderRow.vue`
- `frontend/src/components/library/rows/FolderCard.vue`
- `frontend/src/components/tree/sources/foldersSource.ts`
- `frontend/src/components/tree/LibraryTreePane.vue`
- `frontend/src/components/tree/TreeView.vue`
- `frontend/src/components/tree/treeNode.ts`
- `frontend/src/api.ts`
- `frontend/css/library.css`
- `frontend/tests/library/browseMode.test.ts`
- `frontend/tests/library/entityMenuItems.test.ts`
- `frontend/tests/library/browseSource.test.ts`
- `frontend/tests/tree/flattenVisible.test.ts`

### Steps

1. In `frontend/src/router.ts`, redirect `/` to `/artists` and delete the `/folders` route.
2. In `frontend/src/components/layout/ModeBar.vue`, remove the Folders chip. Artists is the first chip.
3. In `frontend/src/components/library/browseMode.ts`, default `effectiveLibraryMode` to `"artists"`.
4. In `frontend/src/stores/ui.ts`, default `lastLibrary` to the Artists route snapshot; `rememberLibraryRoute` falls back to `"artists"`. Delete `LibSelectionKind`, `libSelected`, `clearLibSelection`, and `toggleLibSelection`. Update the `libraryLayout` comment so it no longer lists Folders.
5. In `frontend/src/components/tree/treeNavigation.ts`, default `snapRoute` / `libraryMode` to `"artists"`. `modeRootLocation` default is `{ name: "artists" }`. Drop the `folders` branch from `isTreeModeRoot`, `isTreeCapable`, and `focusPathFromRoute`.
6. In `frontend/src/components/library/useLibraryLocation.ts`, remove `folderPath`.
7. In `frontend/src/components/library/browseChrome.ts`, drop `mode === "folders"` and `bodyKind === "folders"` from `libraryShowTree`, `libraryShowLayoutToggle`, and `browseGridHost`.
8. In `frontend/src/components/library/browseSource.ts`, remove `folderPath` from `BrowseLoc` and `BrowseGoBackLoc`. Remove `showFolderSelection`, `clearsSelectionOnLoad`, `selectedCount`, `showAddSelected`, `openFolder`, `folderAddAll`, and `folderPlayAll`.
9. In `frontend/src/components/library/sources/onlineBrowse.ts`, delete folder goBack, `loadRoots` / `loadChildren` folder branches, `openFolder`, folder `addAll`, `folderAddAll` / `folderPlayAll`, and `foldersSource` imports. `treeTitle` fallback is `"Artists"`. Flags and `chrome()` no longer mention selection or Folders. Drop `folderPath` from local loc types.
10. In `frontend/src/components/library/sources/downloadsBrowse.ts`, drop the removed flag and chrome fields (`showFolderSelection`, `clearsSelectionOnLoad`, `showAddSelected`).
11. In `frontend/src/components/library/loaders.ts`, delete `FileRowModel`, the `folders` `LibraryBody` member, `browseFolder`, `loadFolders`, and the `loadLibraryPage` folders branch. Remove `folderPath` from `loadLibraryPage`’s loc.
12. Delete `frontend/src/components/library/folderMenuItems.ts`, `frontend/src/components/tree/sources/foldersSource.ts`, `frontend/src/components/library/rows/FileRow.vue`, `frontend/src/components/library/rows/FileCard.vue`, `frontend/src/components/library/rows/FolderRow.vue`, and `frontend/src/components/library/rows/FolderCard.vue`.
13. In `frontend/src/components/library/libraryActions.ts`, delete `addAllForFolder`, `playAllForFolder`, `addSelected`, and the `collectTracks` import.
14. In `frontend/src/api.ts`, delete `BrowseDir`, `BrowseFile`, `BrowseResponse`, `CollectResponse`, and `collectTracks`.
15. In `frontend/src/components/library/entityMenu.ts`, drop `file` and `folder` from `OpenMenu` / `openMenuKey`.
16. In `frontend/src/components/library/entityActions.ts`, drop the `file` and `folder` cases and the `folderMenuItems` import.
17. In `frontend/src/components/library/EntityListHost.vue`, remove the `folders` body branch, folder/file props and emits, and the four deleted row imports.
18. In `frontend/src/components/library/LibraryView.vue`, remove folder/file handlers, Add selected, `libSelected` usage, `folderPath` on loc objects, and `showFolderSelection` menu wiring.
19. In `frontend/src/components/tree/treeNode.ts`, drop `dir` and `file` members and `treeNodePath` if nothing else calls it after the tree pane change.
20. In `frontend/src/components/tree/LibraryTreePane.vue`, remove FileRow, folder/file menu targets, path selection, and `folderPath` on loc objects.
21. In `frontend/src/components/tree/TreeView.vue`, drop the FileRow mention from the leaf-row comment. Keep the missing-cover `folder` glyph.
22. In `frontend/src/components/library/trackMenuItems.ts`, drop “folder-file” from the file comment.
23. In `frontend/css/library.css`, drop “folders, files” from the shared media-card comment.
24. In `frontend/tests/library/browseMode.test.ts`, expect `"artists"` defaults; do not treat `"folders"` as a live mode.
25. In `frontend/tests/library/entityMenuItems.test.ts`, delete the `buildFolderMenuItems` import and describe.
26. In `frontend/tests/library/browseSource.test.ts`, remove `folderPath` from the loc fixture.
27. In `frontend/tests/tree/flattenVisible.test.ts`, build fixtures with a remaining `TreeNode` kind (`artist`, `album`, or `track`), not `dir`.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test -- frontend/tests/library/browseMode.test.ts frontend/tests/library/entityMenuItems.test.ts frontend/tests/library/browseSource.test.ts frontend/tests/library/entityActions.test.ts frontend/tests/tree/flattenVisible.test.ts
```

Confirm `rg -n "folders|folderPath|folderAddAll|collectTracks|BrowseDir" frontend/src frontend/tests` has no Folders-browse hits (scan “same folder” / cover `folder.jpg` comments in other packages are irrelevant here).

## Acceptance

- Opening `/` lands on Artists. The ModeBar has no Folders chip.
- There is no Vue route named `folders`. Folder/file rows, menus, tree source, and multi-select are gone.
- `pnpm --dir frontend typecheck` passes. The listed Vitest files pass.
- Artists, Albums, Search, Stats, and Downloads still have loaders and tree sources.
