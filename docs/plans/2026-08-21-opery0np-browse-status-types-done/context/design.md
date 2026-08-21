**Archive.** Decisions in this file were current as of 2026-08-21 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# One browse source, session-owned status, camel Artist

## Goal

Delete the three leftovers the 2026-08-21 codebase nuclear review ranked as the highest-impact remedies: list and tree become one `BrowseSource`, the now-playing face is session ⊕ source so `RADIO_EXCLUSIVE_SNAP` dies, and artists plus catalog records stop speaking two dialects. Behavior-preserving. Living docs last.

## Settled decisions

- This plan implements that three-part package plus living docs. It is not a research plan.
- `BrowseSource` grows `loadRoots` / `loadChildren` / `resolveCover`. `loadRoots(loc)` returns `{ roots, artUrls, hierarchy? }` (`BrowseTreeLoad`). Online fills `roots` and empty `artUrls`. Downloads fills all three from today’s `loadDownloadsTree`. `onlineBrowse` and `downloadsBrowse` call today’s tree source modules as helpers — do not paste those loaders into the browse objects. `LibraryTreePane` calls the source only. Keep `LibraryView` and `LibraryTreePane` as two SFCs. No optional `loadTree`.
- Stats stays a ModeBar chip and `StatsView`. `load()` is never invoked for stats. Chrome for `/stats` is applied beside load, not as a fake page fetch inside it.
- Browse `artUrls` keys match `art.ts` cache keys already in use: `artist:${id}:thumb` and `cover:${albumId}:thumb`. Delete `a:` and `al:`. Tree *node* keys (`artist:${id}`, `album:${id}`, `track:${id}`, `dir:`, `file:`) stay.
- `PlayStatusState` gains a required `session: "none" | "queue" | "radio"`. `formatPrimaryStatus` and details ignore `exclusiveSnap` when `session === "radio"`. `radioPlayState()` sets `radio`; `NowPlayingFull` sets `queue`. Delete `RADIO_EXCLUSIVE_SNAP`. Do not merge `createRadioAudio` into `htmlAudioSink`. If `PlaybackStatusLine.vue` is touched, switch it to `useDesktopViewport` from `layout.ts`.
- `fromApiArtist` / camel `Artist` live in `frontend/src/models/artist.ts` (same pattern as album and track). Leaves use `albumCount`, `trackCount`, `sortName`, `hasImage`, `hasPreferredImage`, `preferredRev`. `ListenArtist` extends that with camel `playCount` / `lastCountedAt`. `artistImageUrl` reads `preferredRev`; the query param stays `rev`. `fetchArtist`, search artists, and artist list GETs map at the boundary. Delete `ArtistListItem`.
- `CatalogTrackRecord` drops snake fields from the type. `fromApiTrack` / `fromCatalogRecord` still `pick()` snake for old IDB rows. No IDB rewrite. `buildCatalogRecord` already writes camel.
- Last stage patches living docs. Conventions today forbid an Artist mapper; that sentence is rewritten.
- Out: `ExclusiveDevice` dual fields, exclusive store invert, `failCurrentLoad` bag, job `PHASES`, radio HTML merge, host SFC merge, worker/HAL splits, stripping remaining `BrowseSource` booleans.

## Design

`BrowseSource` already owns list load, chrome predicates, and menu `run`s. The tree pane still switches on `mode` for roots, children, and covers, and downloads still publish blob URLs under `a:` / `al:` while `artUrlCache` uses `artist:${id}:thumb` / `cover:${id}:thumb`. Stats is a special case inside `load()`. After this plan the pane asks the same source the list uses. Stats never enters `load()`. Art projections use the cache keys that already exist.

The status line is exclusive-first, so radio carries a dummy snap whose only meaning is “please ignore exclusive.” After this plan `PlayStatusState.session` owns that branch. Radio cannot be relabeled Exclusive by a mistaken snap. The two HTML audio elements stay two elements.

Tracks and albums already normalize at the API edge. Artists and listen-artists are still the wire, and `CatalogTrackRecord` advertises snake aliases the writer does not persist. After this plan artists match albums. Old catalog rows still coerce on read.

## Stage map

1. **`fromApiArtist`** first so browse, tree, artist-art, and stats land on camel and are not edited twice.
2. **Catalog camel-only** next — same type-boundary theme, independent of status, done before downloads tree/browse rewrite art keys on those records.
3. **Browse tree + art keys + stats-out-of-load** — depends on 01 (and is cleaner after 02). Highest remaining frontend leverage.
4. **Status session** — independent of browse. After 03 so `NowPlayingView` / radio wrappers are not in two stages at once.
5. **Living docs** last so conventions, playback, radio, downloads, playback-stats, and project-structure name shipped contracts.

## Out of scope

- Merging `LibraryView` and `LibraryTreePane`
- Merging radio HTML into `htmlAudioSink` or exclusive radio
- Stripping remaining `BrowseSource` boolean flags (`showTrackDownload`, `useLocalAlbumCover`, …)
- Exclusive store invert, `failCurrentLoad` options bag, job `PHASES`
- `ExclusiveDevice` snake/camel dual fields
- IDB catalog rewrite / art-key migration of stored rows
- Splitting `transcode/worker.py` or the Core Audio HAL
- New ADR
- Folder / browse-dir camel (`dirs` / `files` stay server-shaped)

## Assumptions

- Node vitest still has no real HTMLAudio / IndexedDB / companion. Artist and catalog stages are mapper + type tests. Browse tree methods are unit-tested at the source objects. Status tests pass `session` on fixtures.
- Existing IDB catalog rows may still contain snake tech fields; `fromCatalogRecord` keeps accepting a loose record.
- `preferred_rev` on the artist-image query string does not change.
- Tree node keys are not blob-URL keys; unifying them is not required for the art-key delete.
- `pnpm --dir frontend typecheck` and `pnpm --dir frontend test` are the frontend verify commands.
