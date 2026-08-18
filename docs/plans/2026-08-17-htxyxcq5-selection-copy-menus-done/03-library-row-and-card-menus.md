# Stage 03: Library list, grid, search, downloads, headers

## Status
done

## Description

Give every **list/grid** entity row and card a `⋯` (and desktop right-click) by opting those instances into `showMenu`, fold their `+` / chevrons into that menu, and add artist/album page-header `⋯`. Tree instances of the same components stay on today’s `+` / chevron until stage 04. Search and the downloads library reuse the same row components and one discriminated `ActionMenu` per host.

## Rationale

This is the first user-visible “every entity” surface. Shared rows are also tree leaves — they must **opt in** so shipping this stage does not remove tree Add to playlist or show a dead `⋯`.

## Invariants

- One `ActionMenu` per host (`LibraryView`, `DownloadsLibraryView`). Discriminated open target; do not mount a second overlay.
- Close on `route.fullPath`, `ui.libraryLayout`, and `showTree` (same as today’s artist menu).
- Desktop `contextmenu` only when `isDesktopContextMenu()`; `preventDefault`; no long-press.
- Every shared row/card grows opt-in `showMenu` (default `false`). `EntityListHost` sets it when that kind has `entityActions`. Tree hosts do **not** set it in this stage.
- `ArtistRow` / `ArtistCard`: `showMenu` and `includePhoto` are **separate**. Rename card `menuEnabled` → `showMenu`. Drop highlight + `thumb-drop` only when `includePhoto`. Search/downloads: `showMenu=true`, `includePhoto=false`.
- Photo items: `includePhoto: true` on artists list/grid and the **online** artist header. `includePhoto: false` on search artist rows and **all** downloads artist menus (rows, cards, header).
- Open target is a discriminated union. Not `{ kind, key, entity }`.
- Row/card click still opens or plays. `⋯` `stopPropagation`. `TrackRow.onPlay` **and** `FileRow` / `FileCard` click ignore `.row-menu`.
- Card `⋯` is **top-right** on the wrap, sibling of the open-target and of `LossyMark`.
- Track-row / file-row **DownloadIcon stays**. Page Add all / Download pills stay.
- Downloads hosts inject `addAllDownloadedArtist` / `addAllDownloadedAlbum`. They do not pass `downloadAll` / `download`.
- `headerAlbum.artist` is the parent `ar.name` from the `loadDownloadsView` walk. Do not leave it empty.
- Do not change `LibraryChrome.vue`. Header `⋯` goes in existing `#actions`.
- No Vue mount tests.

## Risks

- `ArtistCard` and `FolderCard` are a single `<button class="media-card">`. Nesting `⋯` is invalid HTML and breaks the click target. They must become a wrap + inner open button + sibling `⋯` (AlbumCard already wraps for `LossyMark`).
- Search shows three entity kinds in one list. Toggle identity must include kind + id (or path for folders/files), not a bare artist id.
- `loadArtistDetail` / `loadAlbumDetail` currently keep only the title string. Header `⋯` needs the fetched entity.

## Implementation

### Files

- Change: `frontend/src/components/library/EntityListHost.vue` (replace `artistRowActions` with `entityActions` covering artist / album / track / folder / file)
- Change: `frontend/src/components/library/LibraryView.vue` (one menu state, header `⋯`, `includePhoto` by surface)
- Change: `frontend/src/components/library/loaders.ts` (chrome carries the header entity)
- Change: `frontend/src/components/downloads/DownloadsLibraryView.vue` (same host pattern, `includePhoto: false`)
- Change: `frontend/src/components/library/rows/TrackRow.vue` (`showMenu`; `⋯` replaces `+` only when true; ignore `.row-menu` on play)
- Change: `frontend/src/components/library/rows/FileRow.vue` / `FileCard.vue` (same opt-in; ignore `.row-menu` on click)
- Change: `frontend/src/components/library/rows/AlbumListRow.vue` / `AlbumCard.vue` (`showMenu`; chevron stays when false)
- Change: `frontend/src/components/library/rows/FolderRow.vue` / `FolderCard.vue` (`showMenu`; restructure card wrap)
- Change: `frontend/src/components/library/rows/ArtistCard.vue` (restructure; `showMenu` + `includePhoto`; drop only if `includePhoto`)
- Change: `frontend/src/components/library/rows/ArtistRow.vue` (add `includePhoto`; drop only if `includePhoto`; keep `showMenu`)
- Do not change: `frontend/src/components/library/LibraryChrome.vue`
- Change: `frontend/src/downloads/browse.ts` (`headerArtist` / `headerAlbum`; album `artist` = parent `ar.name`)
- Change: `frontend/css/library.css` (card `⋯` **top-right**; not `.media-card-add` / `LossyMark` corner)

### Steps

1. Extend `LibraryPage` chrome (in `loaders.ts`, not `LibraryChrome.vue`) so artist/album detail loaders stash the fetched entity. On fetch failure, omit header `⋯`.
2. Add `showMenu` (default false) to every shared row/card listed above. When false, chrome is unchanged (`+` / chevron). When true, `⋯` replaces `+` / chevron.
3. Split `ArtistRow` / `ArtistCard`: `showMenu` vs `includePhoto`. Drag-over, drop highlight, and `thumb-drop` run only if `includePhoto`. Rename `menuEnabled` → `showMenu`.
4. Replace `artistRowActions` with `entityActions`. `EntityListHost` sets `showMenu` per kind when that kind’s callbacks exist. Pass `includePhoto` and `onThumbDrop` only for online artists list/grid (not search, not downloads).
5. `LibraryView` holds a discriminated `OpenMenu` union plus `useRowActionMenu`. `nextOpenKey` uses `kind:id-or-path`. Injected `run`s: `addAllFor*`, `runArtistDownloadAll`, `queueOnly`.
6. Track/file `onPlay` / click ignore `.row-menu`. DownloadIcon remains.
7. Cards: wrap so `⋯` is a **top-right** sibling of the open-target. Not `.media-card-add` / `LossyMark`. No button-in-button.
8. Header: in existing `#actions` show `⋯` when chrome has a header entity.
9. `DownloadsLibraryView`: `showMenu` on rows/cards; `includePhoto: false`; inject catalog addAll; omit download items. `headerArtist` / `headerAlbum` with **`headerAlbum.artist = ar.name`** (the parent already in the album-route walk).
10. Close the menu on route, layout, and tree flip. Do not pass `showMenu` from `LibraryTreePane` in this stage.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually, mobile and desktop widths: artists/albums/folders/search/downloads list **and** grid — `⋯` opens, row/card click still opens or plays (tapping `⋯` does **not** play). Tree layout still has `+` on track/file leaves and group plus/download (stage 04). Search artist `⋯` has copy + add all, **no** photo; dropping a file on the thumb does **not** highlight or crop. Artist list `⋯` still has photo + drop. Downloads album header Copy artist name is the parent artist, not missing. Add all works with the server down.

## Acceptance

- [ ] Every list/grid entity type in library, search, and downloads has `⋯` via `showMenu` and desktop right-click using the stage-02 builders.
- [ ] Tree leaves still show `+` (default `showMenu=false`). List/grid `+` / chevron are gone only where `showMenu` is true. Tapping `⋯` does not play.
- [ ] `ArtistRow` / `ArtistCard` split `showMenu` vs `includePhoto`. Search/downloads: menu on, drop/crop off (no highlight).
- [ ] Downloads album header has `artist` from parent `ar.name`. Add all works with the server down.
- [ ] Cards are valid HTML. `⋯` is top-right. One `ActionMenu` per host. `LibraryChrome.vue` is unchanged.
