# Stage 01: BrowseSource and shared entity actions

## Status
done

## Description

Replace the prefixed browse function bags with a real `BrowseSource` object and one `entityActionsFor(source)` factory. `LibraryView` binds `source` from mode once. `LibraryTreePane` uses the same factory. Tree may still map `dl-*` → `OpenMenu`.

## Rationale

The last browse-host stage left identity wrappers and two hosts that still fork `isDownloads` for load, chrome, nav, covers, and menus. This stage deletes that forest without touching the downloads type world.

## Invariants

- One `LibraryView` and one `LibraryTreePane`. Do not merge the SFCs.
- Downloads stays `meta.mode === "downloads"` with today’s routes, chrome visibility, and photo-menu rules (`includePhoto` online artists list only).
- `ArtistListItem` stays snake_case.
- Cover contract unchanged (`""` vs omitted/`null`).

## Risks

- Moving chrome flags onto the source object can drift `showAddAll` / `showAddSelected` / `showDownloadAlbum` if a flag is left as a host ternary. Every `isDownloads ?` in `LibraryView` for those concerns must go through `source`.

## Implementation

### Files

- `frontend/src/components/library/browseSource.ts`
- `frontend/src/components/library/entityActions.ts`
- `frontend/src/components/library/sources/onlineBrowse.ts`
- `frontend/src/components/library/sources/downloadsBrowse.ts`
- `frontend/src/components/library/LibraryView.vue`
- `frontend/src/components/tree/LibraryTreePane.vue`
- `frontend/tests/library/entityActions.test.ts`

### Steps

1. Add `BrowseSource` in `frontend/src/components/library/browseSource.ts`: load, goBack, openArtist, openAlbum, optional openFolder, cover getters, chrome flags (`showAddAll`, `showAddSelected`, `showDownloadAlbum`), `addAll`, `includeArtistPhoto`, and the menu `run`s (`artistAddAll`, `albumAddAll`, optional `artistDownloadAll` / `albumDownload` / `folderAddAll`).
2. Make `onlineBrowse.ts` and `downloadsBrowse.ts` export objects that satisfy `BrowseSource`. Delete `loadOnlinePage` / `loadDownloadsPage` identity wrappers; call `loadLibraryPage` / `loadDownloadsView` from the object. Keep navigation helpers as methods or close over the existing functions.
3. Add `entityActionsFor(source)` in `frontend/src/components/library/entityActions.ts` that returns the `itemsFor` switch currently copied in `LibraryView.vue` (lines 430–480) and `LibraryTreePane.vue` (lines 97–149). Builders stay (`artistMenuItems`, `albumMenuItems`, `trackMenuItems`, `folderMenuItems`).
4. `LibraryView.vue`: `const source = computed(() => mode is downloads ? downloadsBrowse : onlineBrowse)`. Load, goBack, open*, covers, chrome, addAll, and `useEntityMenu({ itemsFor: entityActionsFor(source) })` go through `source`. Stats / tree-vs-list early returns stay on the host.
5. `LibraryTreePane.vue`: pick the same source from `props.mode`. Replace its `itemsFor` switch with `entityActionsFor(source)`. `targetFromNode` may still map `dl-*` in this stage.
6. Add `frontend/tests/library/entityActions.test.ts`: online source injects download `run`s when enabled; downloads source does not; photo items follow `includeArtistPhoto`.

### Verify

- `rg -n "loadOnlinePage|loadDownloadsPage" frontend/src` is empty.
- `rg -n "isDownloads" frontend/src/components/library/LibraryView.vue` has no remaining load/nav/menu/chrome/cover ternaries (stats / `EntityListHost` prop wiring that still needs a mode bit for selection/download-icon policy is allowed only if it reads `source`, not a parallel `isDownloads` forest).
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- `BrowseSource` is a type + two objects, not prefixed free functions.
- List and tree share one `entityActionsFor`. Adding a menu `run` is one factory edit.
- `LibraryView.vue` stays under 649 lines (shrink or hold). Do not push it toward 1k.
- Product browse behavior unchanged: same routes, same pills, same photo rules, same `dl-*` tree kinds as today.
