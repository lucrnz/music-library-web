# Stage 02: Stats eject and BrowseSource slim

## Status
done

## Description

Stop treating `/stats` as a browse-load special case, and shrink `BrowseSource` to a flags bag, one `chrome(input)`, and one `cover()`.

## Rationale

`applyStatsChrome` is the host fork BrowseSource was supposed to delete. The interface then grew ~30 methods so both sources stub chrome and repeat cover lookups. Template gates plus a data bag delete the mutation function and the stub methods.

## Invariants

- `/stats` stays `meta.pane === "library"` and `LibraryView` stays mounted (ModeBar, no remount on leave).
- `LibraryView.load()` is never invoked for `/stats`.
- Online vs downloads still do not switch inside hosts for load, navigate, covers, or menu `run`s — they ask the source.
- Cover-src contract unchanged: omitted/`null` is remote fallback; `""` is placeholder.
- Downloads still never invent `/api/cover` or `/api/artist-image`.

## Risks

- Deleting `applyStatsChrome` without gating `showBack` on `mode !== "stats"` can show the previous page’s back button on Stats.

## Implementation

### Files

- frontend/src/components/library/browseSource.ts
- frontend/src/components/library/sources/onlineBrowse.ts
- frontend/src/components/library/sources/downloadsBrowse.ts
- frontend/src/components/library/LibraryView.vue
- frontend/src/components/tree/LibraryTreePane.vue
- frontend/tests/library/browseSource.test.ts
- frontend/tests/library/entityActions.test.ts

### Steps

1. In `frontend/src/components/library/browseSource.ts`, replace the boolean fields (`ariaLabel`, `showTrackDownload`, `showFolderSelection`, `showListLoading`, `useLocalAlbumCover`, `useLocalTrackCover`, `reportsConnectivity`, `clearsSelectionOnLoad`) with a `flags` object of those keys. Replace `showAddAll` / `showAddSelected` / `showDownloadAlbum` / `includeArtistPhoto` with `chrome(input: BrowseChromeInput): { showAddAll; showAddSelected; showDownloadAlbum; includeArtistPhoto }`. Replace `resolveCover` / `artistCover` / `albumCover` / `trackCover` with one `cover(target, artUrls)` where `target` is `{ kind: "artist"; artist } | { kind: "album"; album } | { kind: "track"; track } | { kind: "tree"; node }`. Keep `load`, navigate, tree (`loadRoots` / `loadChildren` / `treeTitle` / `emptyTreeMessage` / `resolveFocusPath` / `treeReloadKeys`), `addAll`, and menu run methods.
2. Implement `flags`, `chrome`, and `cover` on `frontend/src/components/library/sources/onlineBrowse.ts` and `frontend/src/components/library/sources/downloadsBrowse.ts` with today’s boolean and cover behavior. Tree `cover({ kind: "tree", node })` delegates to artist/album/track from `node.kind` (downloads still prefers `artUrlCache` then `artUrls` under `artist:${id}:thumb` / `cover:${albumId}:thumb`).
3. In `frontend/src/components/library/LibraryView.vue`, delete `applyStatsChrome`. Navigation / `onMounted`: if `mode === "stats"`, do not call `load()` and do not mutate title/body/headers. Bind LibraryChrome `:title="mode === 'stats' ? 'Stats' : title"` and show-back only when `showBack && !showTree && mode !== 'stats'`. Read add/download pills and `includeArtistPhoto` from `source.chrome(...)`. List covers call `source.cover(...)`. Flags come from `source.flags`. Keep the template `StatsView` branch.
4. In `frontend/src/components/tree/LibraryTreePane.vue`, resolve tree covers via `source.cover({ kind: "tree", node }, artUrls)` instead of `source.resolveCover`. Read `includeArtistPhoto` from `chrome()`.
5. Update `frontend/tests/library/browseSource.test.ts` to call `cover({ kind: "tree", node }, artUrls)` (same key assertions as today’s `resolveCover`). Keep `frontend/tests/library/entityActions.test.ts` passing against the real sources after the interface change.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test` (library)

## Acceptance

- `rg applyStatsChrome frontend` is empty.
- `rg "function load\\(" -A 20 frontend/src/components/library/LibraryView.vue` does not contain a stats chrome mutation; stats only skips `load()`.
- `BrowseSource` has `flags`, `chrome`, and `cover`, and does not declare `resolveCover`, `artistCover`, `albumCover`, `trackCover`, `showAddAll`, `showAddSelected`, `showDownloadAlbum`, or `includeArtistPhoto` as methods.
- `/stats` still renders `StatsView` inside `LibraryChrome` with title `Stats` and no back button, without unmounting `LibraryView`.
- Typecheck and library tests pass.
