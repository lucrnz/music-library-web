**Archive.** Decisions in this file were current as of 2026-08-23 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Remove Folders browse

## Goal

Remove the filesystem Folders browse mode and every surface that exists only to power it, so library navigation is Artists, Albums, Search, Stats, and Downloads. Artists is the default home.

## Settled decisions

- Full-stack removal: Folders UI, `GET /api/browse`, `GET /api/collect`, and `Library.browse` / `Library.collect_audio`.
- Disk paths stay for scan, fingerprints, streaming, covers (`folder.jpg` and the like), and same-folder lossless sibling skip. Those are not the Folders view.
- Artists is the default library home. `/` redirects to `/artists`. Last-mode fallbacks that today resolve to `"folders"` resolve to `"artists"`.
- The `/folders` route is deleted. No redirect, no gone page, no silent alias. Old bookmarks and `?path=` do not matter.
- FastAPI’s generic SPA catch-all may still serve HTML for an unknown path. Vue Router will not define a Folders route and will not grow a catch-all just for this.
- Tree / list / grid stay for Artists, Albums, and Downloads. Folder multi-select (`libSelected` / Add selected) goes with Folders.
- The durable product statement (“browse modes do not include filesystem Folders”) is written into living docs in the last stage. This plan directory is not that home.

## Design

Folders is a first-class browse mode today: ModeBar chip, `/folders?path=…`, list/grid/tree of directories and loose files, folder/file `⋯` menus (add all, play all, copy name/path), and multi-select collect. The server lists one filesystem level (`Library.browse` → `/api/browse`) and recursively collects audio ids (`Library.collect_audio` → `/api/collect`), then joins present-track ids with `tracks_repo.id_map_for_paths`. Those two HTTP routes, two `Library` methods, and that query have no other callers.

Catalog navigation already exists beside it: Artists → Albums → Tracks, Albums grid, Search, Stats, Downloads. After this plan the ModeBar is those modes only. Shared hosts (`LibraryView`, `EntityListHost`, `LibraryTreePane`, `BrowseSource`, `TreeNode`) lose their folder/file branches; dedicated rows (`FolderRow` / `FolderCard` / `FileRow` / `FileCard`), `folderMenuItems.ts`, and `foldersSource.ts` are deleted.

`lastLibrary` is in-memory. Defaulting the snapshot and `effectiveLibraryMode` to Artists is enough; there is no persisted “last mode was Folders” to migrate.

`Library.resolve` / `present_audio` stay. They jail paths for stream, scan, covers, and artist-image lookup. Removing browse/collect does not change path identity.

## Stage map

1. **Strip Folders from the SPA** first so the product no longer offers or calls folder browse. Artists becomes home. Shared types drop folder/file members in the same stage so the client cannot compile against a half-removed mode.
2. **Delete browse/collect on the server** next. It depends on stage 01: once the SPA no longer imports `/api/browse` or `/api/collect`, the routes and `Library` helpers are dead surface and can go without a client/server skew.
3. **Living docs** last, against the browse modes and route list stages 01–02 actually ship. `context/design.md` is not the long-term home of the decision.

## Out of scope

- Scan same-folder lossless sibling skip
- Embedded / folder-filename cover lookup
- Track path columns, fingerprints, or rename reattach
- Artists, Albums, Search, Stats, Downloads browse
- Tree layout for remaining modes
- A Vue Router catch-all or any `/folders` compatibility handler
- Mapping a leftover folder path onto an artist or album
- Historical `docs/plans/*-done` archives
- The tree missing-cover `folder` glyph (not the Folders browse mode)

## Assumptions

- `ui.lastLibrary` is not persisted; changing its default to Artists covers reload.
- Downloads never implemented folder collect; removing optional `folderAddAll` / `folderPlayAll` does not change Downloads.
- `flattenVisible` tests use `kind: "dir"` only as a fixture. After `dir` / `file` leave `TreeNode`, those fixtures switch to a remaining kind.
- `Library._natural_key` exists only for browse/collect sort; it goes with those methods.
