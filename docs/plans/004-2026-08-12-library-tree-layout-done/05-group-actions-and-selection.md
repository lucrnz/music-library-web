# Stage 05: Entity actions API, group actions, folder multi-select

## Status
done

## Description

Generalize queue/download helpers to **entity-id APIs** so chrome and tree group rows share one path. Wire per-node Add-all (artist/album/folder) and album Download when downloads enabled. Keep Folders multi-select on tree dir/file rows via existing `ui.libSelected`.

## Rationale

Tree sits on mode-root routes, so route-keyed chrome Add-all/Download cannot express expanded nodes. Entity-level actions delete the “tree special case” and clean list drill-down callers too.

## Implementation

### `libraryActions.js` (canonical)

- Prefer explicit helpers, e.g.:
  - `addAllForFolder(path)`
  - `addAllForArtist(artistId)`
  - `addAllForAlbum(albumId)`
  - `downloadAlbum(albumId)` / `downloadTracks(tracks)` (reuse `downloads/ui.js`)
- Route-based `addAll(loc)` becomes a thin dispatcher to the above (or call sites switch to entity helpers). **No** parallel tree-only copy of collect logic.

### Tree group slots

- Artist: Add-all control.
- Album: Add-all + Download icon when `downloads.enabled`.
- Folder dir: Add-all for path; selection control consistent with `FolderRow` (click select ≠ toggle expand).
- File leaf: existing add/play + selection like `FileRow`.

### Chrome

- Folders + tree: keep Add-all (root path) and Add selected when selection non-empty.
- Artists/Albums + tree: hide route-based Add-all/Download chrome; group rows own bulk actions.

### Smoke

- Artist Add-all fills queue; album Download enqueues offline; multi-select two folders → Add selected; list mode still works; no duplicated collect paths left behind without reason.
