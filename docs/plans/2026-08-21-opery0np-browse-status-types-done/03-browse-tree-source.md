# Stage 03: BrowseSource owns the tree

## Status
done

## Description

`BrowseSource` grows `loadRoots` / `loadChildren` / `resolveCover`. The two source objects call today’s tree modules as helpers. `LibraryTreePane` stops switching on `mode` for those three jobs. Browse `artUrls` use `artist:${id}:thumb` and `cover:${albumId}:thumb`. Stats never enters `load()`.

## Rationale

This is the list/tree twin. `entityActionsFor(source)` is already shared; loading is not. The pane still derives download-vs-online covers and `showTrackDownload` from `mode`. Unifying art keys deletes the `a:` / `al:` fork `downloadsBrowse.artistCover` currently has to try both sides of.

## Invariants

- `LibraryView` and `LibraryTreePane` stay two SFCs.
- Tree source modules stay as files; their bodies are not pasted into `onlineBrowse.ts` / `downloadsBrowse.ts`.
- Tree node keys stay `artist:${id}`, `album:${id}`, `track:${id}`, `dir:…`, `file:…`.
- Stats remains a ModeBar chip and `StatsView` mount. Product chrome (title “Stats”, no back) is unchanged.
- `BrowseSource` boolean flags that already exist (`showTrackDownload`, `includeArtistPhoto`, …) are reused; do not add a parallel `downloadsMode` bit on the pane.

## Risks

- `onlineBrowse.loadRoots` must branch on `loc.mode` (artists / albums / folders). That branch belongs on the online source, not in the pane.
- Skipping `load()` for stats without a chrome apply leaves the view-bar title on the previous mode.

## Implementation

### Files

- frontend/src/components/library/browseSource.ts
- frontend/src/components/library/sources/onlineBrowse.ts
- frontend/src/components/library/sources/downloadsBrowse.ts
- frontend/src/components/tree/LibraryTreePane.vue
- frontend/src/components/library/LibraryView.vue
- frontend/src/downloads/browse.ts
- frontend/src/components/tree/sources/downloadsSource.ts
- frontend/src/components/library/loaders.ts
- frontend/tests/library/browseSource.test.ts

### Steps

1. In `frontend/src/components/library/browseSource.ts`, add `BrowseTreeLoad` (`roots: TreeNode[]`, `artUrls: Record<string, string>`, optional downloads `hierarchy`) and extend `BrowseSource` with `loadRoots(loc: BrowseLoc): Promise<BrowseTreeLoad>`, `loadChildren(node: TreeNode): Promise<TreeNode[]>`, and `resolveCover(node: TreeNode, artUrls: Record<string, string>): string`. Reuse the existing `TreeNode` type. Do not add `loadTree`.
2. `onlineBrowse.loadRoots` switches on `loc.mode` and calls `listArtistRoots` / `listAlbumRoots` / `listFolderRoots` from the existing tree source modules; return `{ roots, artUrls: {} }`. `loadChildren` calls `loadArtistChildren` / `loadAlbumChildren` / `loadFolderNodeChildren`. `resolveCover` returns `node.cover || ""`.
3. `downloadsBrowse.loadRoots` calls `loadDownloadsTree` and returns `{ roots, artUrls, hierarchy }`. `loadChildren` calls `loadDownloadsChildren`. `resolveCover` uses `artUrlCache.urls[`artist:${id}:thumb`]` then `artUrls[`artist:${id}:thumb`]` / `artUrls[`cover:${albumId}:thumb`]`.
4. Rewrite `LibraryTreePane.vue` so roots, children, covers, `showTrackDownload`, and photo-drop eligibility go through `source`. Delete the `mode === "artists" | "albums" | "folders" | "downloads"` switches for those jobs. Store `artUrls` / `hierarchy` from `BrowseTreeLoad`.
5. In `frontend/src/downloads/browse.ts` and `frontend/src/components/tree/sources/downloadsSource.ts`, write `artUrls[`artist:${id}:thumb`]` and `artUrls[`cover:${albumId}:thumb`]`. Delete `a:` and `al:`. Update the `artUrls` comment on `LibraryPage` in `frontend/src/components/library/loaders.ts`.
6. In `LibraryView.vue`, do not call `load()` when `mode === "stats"`. Apply stats chrome (title “Stats”, no back, empty body) via `applyStatsChrome` next to `applyTreeChrome` from the navigation handler. Delete the stats early-return from `load()`.
7. Add `frontend/tests/library/browseSource.test.ts`: downloads `resolveCover` reads `artist:${id}:thumb` and does not look up `a:`; a `BrowseTreeLoad` from a mocked downloads `loadRoots` includes `artUrls` under the cache keys.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test tests/library/browseSource.test.ts tests/library/browseMode.test.ts tests/tree/downloadsMenuMap.test.ts tests/tree/flattenVisible.test.ts`

## Acceptance

- `LibraryTreePane.vue` has no `props.mode === "artists"` (or albums / folders / downloads) branch for loading roots, children, or resolving covers. Those calls go to `source.loadRoots` / `source.loadChildren` / `source.resolveCover`.
- `rg 'a:\$\{|al:\$\{' frontend/src` is empty. Browse/tree art maps use `artist:${id}:thumb` and `cover:${albumId}:thumb`.
- `load()` in `LibraryView.vue` has no `mode === "stats"` branch. Stats chrome is applied without a page fetch.
- `pnpm --dir frontend typecheck` exits 0. The Verify test list exits 0.
