**Archive.** Decisions in this file were current as of 2026-08-17 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Selection and copy menus

## Goal

Make the SPA feel like an application: chrome text is not selectable, and every music entity exposes an overflow menu that copies names (and lyrics) to the clipboard instead of relying on native text selection.

## Settled decisions

- **App-wide selection lock.** `user-select: none` and `-webkit-touch-callout: none` on the app shell. Opt `user-select: text` (and default callout) back in only for `input`, `textarea`, `[contenteditable]`, and `.lyrics-plain`.
- **Not selectable:** view titles, now-playing meta, settings copy, dialogs, toasts, empty/error banners, playback-details values, tree group titles, synced lyric lines. Settings diagnostic IDs stay non-selectable; they already have a Copy pill.
- **Shared clipboard helper.** One `copyText` used by Settings and every new copy action. Success toast “Copied”; failure “Could not copy”. Empty values are omitted from menus, not copied as blank.
- **`⋯` on every entity.** Artists, albums, tracks, folders, folder-files, queue — list, tree, **and grid cards**. Artist and album **page headers**. **Expanded now-playing**. Not the mini-player. Not the lyrics overlay.
- **`⋯` is the action home.** Track/file `+` is removed; Add to playlist lives in `⋯`. Album/folder chevrons become `⋯` (row/card click still opens). Tree `+` and album-download icons go away. Track-row **DownloadIcon stays**. Page-level Add all / Download pills stay.
- **Grid cards get a visible `⋯`.** Desktop also right-clicks the card/row. No native browser menu. No long-press. Same `ActionMenu` / `useRowActionMenu` / `isDesktopContextMenu` pattern as queue and artists today. No `stores/actionMenu.ts`.
- **Header `⋯` is that entity’s row menu.** Artist header = artist row builder. Album header = album row builder. Online loaders stash the fetched entity on `LibraryPage` chrome. Downloads headers: extend `DownloadsBrowseState` with the current artist/album (already loaded in `loadDownloadsView`). Do not rebuild a menu from the title string.
- **`showMenu` and `includePhoto` are separate props** on `ArtistRow` and `ArtistCard` (rename card `menuEnabled` → `showMenu`). `showMenu` = overflow chrome. `includePhoto` = photo menu items **and** drop-to-crop (drag highlight + `thumb-drop`). Search/downloads: `showMenu=true`, `includePhoto=false`. Omitting `onThumbDrop` is not enough — the row prop must be false or drops still highlight.
- **Photo menu gate unchanged except the artist header.** Change / Use library photo on artists **list, grid, tree, and online artist-page header**. Still **not** on search, downloads (rows, tree, or header), queue, or now-playing. Album cards on the artist page get the album menu, not the photo menu.
- **Builders take injected mutating `run`s.** They own labels, order, and copy items. Hosts pass `addAll` / optional `downloadAll` / `addToPlaylist`. Online hosts pass `libraryActions` (and the existing artist download-confirm helper). Downloads hosts pass catalog functions from `frontend/src/downloads/addAll.ts`. Builders must not call `fetchArtistAlbums`, `fetchAlbumTracks`, or `downloadAlbumById`.
- **Downloads `⋯` is Add all + copies.** No Download / Remove download on those menus. Track-row **DownloadIcon stays**. **New:** downloads artist Add all flattens every catalog album for that artist (`addAllDownloadedArtist`). Album Add all is today’s `dl-album` walk, lifted out of the pane (`addAllDownloadedAlbum`).
- **Copy catalog** (omit an item when its string is empty/whitespace):

  | Surface | Items in order |
  |---|---|
  | Artist row / header | Add all · Download all (if enabled) · Copy artist name · Change photo · Use library photo |
  | Album row / header | Add all · Download (if enabled) · Copy album name · Copy artist name |
  | Track / folder-file | Add to playlist · Copy title · Copy artist name · Copy album name |
  | Folder | Add all · Copy folder name · Copy full path (`BrowseDir.path`) |
  | Queue | Go to album · Go to artist · Copy title · Copy artist name · Copy album name · Download · Remove |
  | Now-playing | Copy title · Copy artist name · Copy album name · Copy lyrics (if it might be copyable) · Go to album · Go to artist |

- **Copy title** is `track.title` (or folder-file `displayName` / `name` when there is no title). Not `formatTrackLabel`.
- **No copy icon** in the sprite today. Copy items are label-only; do not add a glyph in this plan.
- **Lyrics.** Plain (`.lyrics-plain`): selectable **and** copyable as-is. Synced (`.lyrics-line`): not selectable (tap-to-seek stays); **Copy lyrics** flattens via `parseLrc` — drop empty/`♪` lines, collapse consecutive duplicate texts, join with newlines. Do not prefer a parallel `plainText` field when synced lines exist; fall back to `plainText` only if flatten yields nothing.
- **Copy lyrics visibility.** Export sync `peekLyricsMemory(trackId): Lyrics | undefined` from `lyrics/cache.ts` (memory map only). Hide the item only when a **real** peek exists and `lyricsClipboardText(peek)` is `null`. No peek → show. `run()` always `resolveLyrics`, ignore the result if `trackId` changed, then `copyText` or toast “No lyrics to copy”. Do **not** call `resolveLyrics({ allowNetwork: false })` to decide visibility (`not_found` on a miss is synthetic). Memory/IDB only store `ok` | `instrumental`; do not change cache policy.
- **Now-playing is copy-focused.** No Remove from queue, no download row. Navigation is Go to album / Go to artist only. `⋯` sits in expanded `.sheet-grab` next to Close. The stage-02 builder is store-free: it takes `offerCopyLyrics: boolean` and `copyLyrics: () => Promise<void>`; stage 05 supplies those. No stub `run`.
- **Shared rows/cards opt in to `⋯`.** Every list row/card (`TrackRow`, `FileRow`, `FileCard`, `AlbumListRow`, `AlbumCard`, `FolderRow`, `FolderCard`, plus existing `ArtistRow` / `ArtistCard`) takes `showMenu` (default `false`). When false: today’s chrome (`+` / chevron, no `⋯`). When true: `⋯` replaces `+` / chevron. Stage 03 sets it from `EntityListHost` only. Stage 04 turns it on for tree groups/leaves. Shipping 03 must not regress tree leaves.
- **Menu open target** is a discriminated union (`{ kind: "artist"; artist: ArtistListItem } | { kind: "album"; album: LibraryAlbum } | …`), not `{ kind, key, entity }`. Do not teach builders about tree nodes.
- **`dl-*` projections** live in `frontend/src/components/tree/sources/downloadsMenuMap.ts` (not in the pane SFC):

  | Source | Result |
  |---|---|
  | `dl-artist` (`DownloadsHierarchyArtist`) | `ArtistListItem`: `id = artistId`, `name`, counts from albums/tracks, `has_preferred_image: false`, `preferred_rev: 0` |
  | `dl-album` (`DownloadsHierarchyAlbum` + parent name) | `LibraryAlbum`: `id = albumId`, `title`, `artist = artistName` |
  | `dl-track` (`CatalogTrackRecord`) | `Track` via existing `fromCatalogRecord` |

  Parent name for a `dl-album`: pass `ar.name` (hierarchy parent or `loadDownloadsView` walk). **`treeNodeId` is not the id.** If `artistName` is empty, Copy artist name is omitted.
- **Downloads header album** must set `headerAlbum.artist` from the parent `ar.name` already in the `loadDownloadsView` walk (same string artist-page album cards already use). Today that string is discarded on the album route.
- **Card `⋯` is top-right** on the wrap, sibling of the open-target and of `LossyMark`. Not on the `LossyMark` / `.media-card-add` corner.
- **Do not edit** `LibraryChrome.vue` (header `⋯` goes in existing `#actions`), `TreeView.vue` (already emits `row-contextmenu` for every row), or `PlayerBar.vue` (`NowPlayingFull` owns close on collapse / track change). Selection CSS lives only in `app.css`.
- **Play/open ignore list.** `TrackRow.onPlay`, `FileRow` / `FileCard` click must ignore `.row-menu` (today they only ignore `.row-add` / `.row-download` / `.lossy-mark`).
- **Tree leaves:** `⋯` is the row button only. Pane owns desktop `contextmenu` (switch on `artist | album | dir | dl-artist | dl-album | track | file | dl-track`). Leaves get `menu-click` + `stopPropagation` only — do not also bind row `contextmenu` or right-click toggles the menu closed.

## Design

Selection is a **default-off** policy, not another class list. New chrome cannot leak. Form fields and unsynced lyrics are the only document-like regions.

Copy is a **menu action**, not a selection gesture. One helper owns `navigator.clipboard.writeText` and the two toasts so Settings and row menus cannot drift.

Menus stay on the existing `ActionMenu` shell (card below 900px, anchored dropdown at/above). Each view host mounts its own picker. Library list/grid/search/downloads share **one** `ActionMenu` per host with a discriminated open target (artist | album | track | folder | file) so Search and Folders can open different entity menus without a second overlay.

`EntityListHost` grows a single `entityActions` object. Presence of a kind’s callbacks is what sets that row’s `showMenu`. Artist `includePhoto` is a separate flag on the row/card (and only then is `onThumbDrop` passed). Do not add one prop per callback.

Grid cards that are a single `<button class="media-card">` (`ArtistCard`, `FolderCard`) cannot nest `⋯`. They restructure to a wrap (already used by `AlbumCard` for `LossyMark`) with the open-target button and a sibling `⋯` that `stopPropagation`s.

Tree group `+` / download icons disappear because those actions live in `⋯`. Folder **select** (check) stays — it is multi-select, not an overflow action. Enabling desktop `contextmenu` on albums/folders/downloads trees **replaces** today’s native browser menu on those rows.

Lyrics flatten is a pure function next to `parseLrc`. Now-playing `⋯` peeks memory to decide whether to list Copy lyrics, then `resolveLyrics` (memory → IDB → network) on click so the overlay does not need to be open.

Downloads tree nodes are `dl-artist` / `dl-album` / `dl-track`. The pane calls `downloadsMenuMap` then the same builders, and injects catalog `addAll`. Online download items are omitted on the downloads pane.

## Stage map

Policy and helpers first, then item builders (queue and existing artist menus pick up copy with no new chrome), then the large library wiring, then tree (different host and icon removal), then now-playing (lyrics + new player chrome), then living docs.

1. **Selection CSS + clipboard helper** — nothing else should invent a second `writeText` or a third `user-select` rule.
2. **Item builders + lyrics flatten + catalog addAll + peek** — pure, tested. Mutating `run`s injected. Queue and current artist `⋯` gain copy items immediately. Later stages only wire chrome and pass hosts’ `run`s.
3. **Library list, grid, search, downloads, headers** — `EntityListHost` opts shared rows into `showMenu`; split artist photo/drop; headers. Tree leaves keep `+` (default `showMenu=false`). Needs 02.
4. **Tree menus** — turn on `showMenu` for groups/leaves; `downloadsMenuMap`; remove tree `+` / download; pane-owned contextmenu. Needs 02–03.
5. **Now-playing `⋯` + Copy lyrics** — `.sheet-grab` chrome; peek + `resolveLyrics`. Needs 01–02.
6. **Living docs** — last so `docs/frontend/conventions.md` describes what shipped.

## Out of scope

- Mini-player `⋯`
- Lyrics-overlay `⋯` or a dedicated copy button on the overlay
- Folder **page-header** `⋯` (folder name/path copy stays on the folder row/card/tree node)
- Playback-details, settings values, dialogs, toasts, or error banners as selectable text or copy menus
- Long-press menus
- New clipboard polyfill / `execCommand('copy')`
- New sprite glyph for copy
- Folding track-row `DownloadIcon` into `⋯`
- Removing page-level Add all / Download pills
- Backend or lyrics-fetch pipeline changes
- Changing lyrics cache policy (still memory/IDB `ok` | `instrumental` only)
- Batch Remove download on artist/album menus
- Using `resolveLyrics({ allowNetwork: false })` as a peek

## Assumptions

- `navigator.clipboard.writeText` is available in the same contexts Settings already copies diagnostic IDs.
- Folder-file copy uses the attached `Track` when present; otherwise title is `displayName` / `name` and artist/album items are omitted.
- Page-level Add all / Download pills remain; they apply to the **current page**, not a single child row.
- Existing `.row` / `.media-card` / `.lyrics-line` `user-select: none` rules may stay; the global lock is the policy.
- Downloads menus never call `fetchArtistAlbums` / `fetchAlbumTracks` / `downloadAlbumById`.
- Lyrics menu-build time can only observe memory `ok` | `instrumental`. `not_found` / `error` / `skipped` are not knowable without a network fetch.
- `DownloadsBrowseArtist` is enough for a photo-off header (id + name + addAll). Do not invent `has_preferred_image` on that type.
- Queue go-to and now-playing go-to stay `router.push` inside those builders (one host each). Only add/download/add-to-playlist are injected.
