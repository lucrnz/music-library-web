# Stage 04: Mode adapters (Artists, Albums, Folders, Downloads) + host switch

## Status
done

## Description

Implement **TreeSource adapters** for each surface and a thin layout switch in library hosts. Shapes: Artists artist→album→tracks; Albums album→tracks; Folders lazy FS browse; Downloads always artist→album→tracks (offline hierarchy). Top-level lists keep the existing **500** cap.

## Rationale

With engine + navigation already in place, adapters are data-only and stay small. Hosts only choose list/grid (`EntityListHost`) vs `TreeView`+source — no expand logic in hosts.

## Implementation

### Adapters (e.g. `components/tree/sources/`)

- `artistsSource` — roots: `/api/artists?limit=500`; children: albums then tracks via existing `fetchArtistAlbums` / `fetchAlbumTracks`.
- `albumsSource` — roots: `/api/albums?limit=500&sort=title`; children: tracks.
- `foldersSource` — roots: browse `""`; children: browse path; map dirs/files like `loadFolders` (reuse mapping helpers; extract from `loaders.js` if needed rather than copy-paste).
- `downloadsSource` — `buildDownloadsHierarchy()`; expand is UI-only if tree fully in memory; local art resolvers as today.

### Hosts (thin)

- `LibraryView`: if `libraryLayout === "tree"` and mode in folders|artists|albums and toggle would show → render `TreeView` + source; else existing list/grid path. **No** tree policy/expand code beyond wiring.
- `DownloadsLibraryView`: same for downloads mode at tree-capable surfaces.
- Enable Tree in the layout menu if not already (stage 01 gate).

### Leaves / groups

- Track leaves: existing `TrackRow` (play = primary click).
- File leaves: existing `FileRow` behavior.
- Group rows: cover + title + counts; actions empty until stage 05 (slots ready).

### Hard rules

- Do not fork `TreeView` per mode.
- Do not teach `EntityListHost` about tree.
- Manager continues on same engine (stage 02); downloads library adapter is play-oriented, not delete.

### Smoke

- Each mode: expand to leaves, play a track/file; list/grid unchanged; navigation policy still coerces deep links to root+expand.
