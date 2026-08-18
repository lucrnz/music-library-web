# Stage 04: Tree entity menus

## Status
done

## Description

Put `⋯` on every tree entity — including downloads `dl-artist` / `dl-album` / `dl-track` — move add-all / download into those menus, and enable desktop right-click on all library/downloads tree modes so the native browser menu goes away.

## Rationale

Tree chrome is a different host (`LibraryTreePane` / `TreeView`) with its own `+` and download icons. Stage 03 left tree instances on `showMenu=false`. This stage turns `showMenu` on and wires `menu-click`. Do not assume leaves already have `⋯`.

## Invariants

- Folder **select** (check) stays on directory groups. It is not an overflow action.
- Tree `+` (add all) and tree album-download icons are removed. Those actions are injected `run`s on the stage-02 builders. **`dl-album` Add all must remain** via `addAllDownloadedAlbum` after the plus icon is gone.
- Track / file / `dl-track` leaves reuse `TrackRow` / `FileRow`. This stage sets `showMenu` and binds `menu-click`. Do not add a second `⋯` in `#group-actions` for leaves.
- Artist photo: `includePhoto` true only when `mode === "artists"`. Downloads tree artists: `showMenu=true`, `includePhoto=false`.
- Open target is the stage-03 union. Project `dl-*` with `downloadsMenuMap.ts` (see [design.md](context/design.md)). **`treeNodeId` is not the id** for `dl-*`.
- `dl-album` artist name is the parent `ar.name` passed into `albumFromDl`. Empty name ⇒ omit Copy artist name.
- `TreeView.vue` is **not** edited. It already emits `row-contextmenu` for every row. The pane `preventDefault`s when `isDesktopContextMenu()`.
- Pane owns contextmenu for **all** kinds (`artist | album | dir | dl-artist | dl-album | track | file | dl-track`). Leaves receive `menu-click` + `stopPropagation` only — do not also bind `TrackRow`/`FileRow` `row-contextmenu`.
- Downloads inject catalog `addAll` only. No `downloadAll` / `download` on downloads tree menus.
- No long-press. No second overlay system.

## Risks

- Today `LibraryTreePane` binds contextmenu **only** when `mode === "artists"` so other modes keep the native menu. Enabling it for albums/folders/downloads is a deliberate product change from [design.md](context/design.md).
- Group rows are `.tree-row`, not `.row`. `⋯` must sit in `#group-actions` without colliding with the remaining select check.

## Implementation

### Files

- Create: `frontend/src/components/tree/sources/downloadsMenuMap.ts` (`artistFromDl`, `albumFromDl`, `trackFromDl`)
- Create: `frontend/tests/tree/downloadsMenuMap.test.ts` (id fields, parent artist name, `fromCatalogRecord`)
- Change: `frontend/src/components/tree/LibraryTreePane.vue` (`showMenu` on leaves; group `⋯`; remove plus/download; pane contextmenu; call the mapper)
- Do not change: `frontend/src/components/tree/TreeView.vue`
- Change: `frontend/css/tree.css` only if the extra `⋯` needs layout once plus/download are gone

### Steps

1. Bind TreeView `row-contextmenu` in the pane for folders, artists, albums, **and** downloads. `preventDefault` when `isDesktopContextMenu()`.
2. `#group-actions`: keep folder select. Add `⋯` for `artist`, `album`, `dir`, `dl-artist`, `dl-album`. Remove the plus button and the album download button.
3. Leaves: pass `showMenu` and `menu-click` into `TrackRow` / `FileRow` (including `dl-track` via `TrackRow`). `stopPropagation` so pane contextmenu does not toggle the same menu closed. Do not bind leaf `row-contextmenu`.
4. `downloadsMenuMap.ts`: `artistFromDl(ar)` → `ArtistListItem` (`id: artistId`, counts, photo flags false/0). `albumFromDl(al, artistName)` → `LibraryAlbum` (`id: albumId`, `artist: artistName`). `trackFromDl(rec)` → `fromCatalogRecord(rec)`. Pane looks up `artistName` from the parent `dl-artist` (`ar.name` / node title); do not call `treeNodeId`.
5. Open target is the stage-03 union. Inject online `addAllFor*` / `downloadAlbumById` / `runArtistDownloadAll`, or catalog `addAllDownloaded*`.
6. `includePhoto` only in artists mode. Close on route / layout / mode change.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually: folders/artists/albums/downloads tree — group `+` and album download icons are gone; `⋯` offers add-all / copy / (online download when enabled); **`dl-album` and `dl-artist` Add all still work offline**; folder check still selects; each leaf has one `⋯`; desktop right-click opens the app menu, not the browser menu, and does not immediately close it; artists tree still has photo items; downloads tree artists do not.

## Acceptance

- [ ] Every tree entity kind has one `⋯` because **this stage** set `showMenu` / group `⋯`, not because stage 03 already did.
- [ ] `downloadsMenuMap` is unit-tested; `dl-album` Copy artist name uses parent `ar.name`; ids are `artistId` / `albumId`.
- [ ] Tree plus and album-download icons are gone; folder select remains; `dl-album` / `dl-artist` Add all still works from the catalog.
- [ ] Desktop contextmenu is the app menu in all four tree modes. Right-click on a leaf does not toggle the menu closed. `TreeView.vue` is unchanged.
