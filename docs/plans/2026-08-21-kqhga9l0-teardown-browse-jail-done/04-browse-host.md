# Stage 04: One browse host + cover contract

## Status
done

## Description

Mount one `LibraryView`. Delete `DownloadsLibraryView`. `loadDownloadsView` returns `LibraryPage`. A `BrowseSource` owns online vs downloads load, chrome, navigation, covers, and menu `run`s. Row `coverSrc`: omitted/`null` = remote fallback; `""` = placeholder.

## Rationale

The twin list SFCs are the largest remaining copy. Stage 03 already owns the menu. This stage deletes the second host and the offline `/api/cover` leak without changing routes or chrome rules.

## Invariants

- Routes and `meta.mode` / `meta.pane` are unchanged (`/downloads`, `downloads-artist`, `downloads-album`, `pane: "library"`).
- Online chrome rules stay in today’s functions (tree/search/stats/photo/`showAddSelected`/`showDownloadAlbum`). Downloads still: no photo, no folder select, no search, `showTrackDownload: false`, Add all only when the page has tracks, layout toggle hidden on album detail.
- `ArtistListItem` stays snake_case. Downloads still fabricates `album_count` / `track_count` for headers and rows.
- `LibraryView` does not grow past ~1k lines. Mode-specific load/nav/covers live in source modules, not new `if (downloads)` blocks piled into the SFC.
- Tree pane is still `LibraryTreePane` with `mode` `"downloads"` | online modes. No tree-source rewrite.

## Risks

- `useLibraryLocation` / `useBrowseLayout` `isActivePane` today forks (`pane === "library"` vs `mode === "downloads"`). The surviving host must treat downloads as the library pane (`pane === "library"`) and choose the source from `mode === "downloads"`. Do not leave a `mode === "downloads"` pane check that skips loads on `/queue` last-library restore incorrectly — last-library on `/queue` is never downloads (unchanged `effectiveLibraryMode`).
- Online artist rows already pass `coverSrc(artist)` from `artistArt/state` (always a URL). Do not pass `""` there or online artist art becomes a placeholder.
- `EntityListHost` must tell rows “getter ran” vs “no getter”. Default `coverSrc` on rows cannot stay `""` if `""` means placeholder.

## Implementation

### Files

- `frontend/src/components/library/LibraryView.vue`
- `frontend/src/components/downloads/DownloadsLibraryView.vue` (delete)
- `frontend/src/components/App.vue`
- `frontend/src/downloads/browse.ts`
- `frontend/src/components/library/loaders.ts` (only if `LibraryPage` needs a downloads-friendly extra; prefer none)
- `frontend/src/components/library/sources/onlineBrowse.ts` (new) and/or `downloadsBrowse.ts` (new) — names may vary; two source modules, not a third host SFC
- `frontend/src/components/library/browseChrome.ts`
- `frontend/src/components/library/rows/ArtistRow.vue`
- `frontend/src/components/library/rows/ArtistCard.vue`
- `frontend/src/components/library/rows/AlbumListRow.vue`
- `frontend/src/components/library/rows/AlbumCard.vue`
- `frontend/src/components/library/rows/TrackRow.vue`
- `frontend/src/components/library/EntityListHost.vue`
- `frontend/src/components/library/useBrowseLayout.ts` (only if the pane predicate needs a one-line fix)
- `frontend/tests/library/` (page-shape / cover-contract unit tests as needed)

### Steps

1. Change `loadDownloadsView` to return `LibraryPage` (`chrome`, `body`, `headerArtist`, `headerAlbum`). Delete `DownloadsBrowseState` and the view’s remap into `LibraryBody`. Keep fabricating snake_case `ArtistListItem` headers.
2. Introduce `BrowseSource` with: `loadPage`, tree/layout-toggle/grid-host flags (reuse `browseChrome.ts`; fold `downloadsShowTree` / `downloadsShowLayoutToggle` into mode-aware functions rather than leaving a parallel API), `covers` getters, navigate (`openArtist` / `openAlbum` / `openFolder` / `goBack`), chrome pills, `showTrackDownload`, `includePhoto`. Online source wraps `loadLibraryPage` + today’s LibraryView rules. Downloads source wraps the new `loadDownloadsView` + today’s DownloadsLibraryView rules.
3. Rewrite `LibraryView` as location → source → `useBrowseLayout` + `useEntityMenu` + chrome + `EntityListHost` / tree / stats. Stats stays online-only (`mode === "stats"`).
4. `App.vue`: always mount `LibraryView` (still unmount on `/radio`). Delete the `onDownloads` `v-if`. Delete `DownloadsLibraryView.vue`.
5. Cover contract: row `coverSrc` default `null`/`undefined` → existing `artistImageUrl` / `coverUrl` fallback. If the prop is a string (including `""`), use it and do not hit `/api`. `EntityListHost` passes `artistCover?.(a) ?? null` only when the source provided a getter; downloads getters return `""` when local art is missing. Online album/track getters stay omitted.

### Verify

- `rg -n "DownloadsLibraryView" frontend/src` is empty.
- `rg -n "DownloadsBrowseState" frontend/src` is empty.
- `wc -l frontend/src/components/library/LibraryView.vue` is under 1000.
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- `App.vue` has one library SFC. `DownloadsLibraryView.vue` does not exist.
- `/downloads`, `/downloads/artists/:id`, `/downloads/albums/:id` still render the offline catalog through `LibraryView` with the same chrome and empty copy as today.
- Online folders/artists/albums/search/stats/tree and photo menu are unchanged.
- Downloads rows with no local art do not request `/api/cover` or `/api/artist-image`. Online album/track rows with no getter still use `coverUrl`.
- `LibraryView.vue` is under 1k lines. Mode-specific load/nav/covers are not inlined as a second copy of the deleted SFC.
- Typecheck and frontend tests pass.
