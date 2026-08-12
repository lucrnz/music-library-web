# Stage 02: Kind-map group add + downloads album queue

## Status
done

## Description

Replace ternary / multi-handler group-add wiring in `LibraryTreePane` with a kind→handler map and a single runner that toasts on hard failure. Include `dl-album`: queue local offline tracks via stage-01 projector + `addToQueue`. Copy remains “Add all to playlist”.

## Rationale

Chrome Add all is correctly hidden in tree mode; bulk actions live on group rows. Catalog kinds already expose plus; downloads uses `dl-album`, which never matched `showGroupAdd`. Extending the existing click ternary would grow spaghetti. A kind map + one `onGroupAdd` deletes that branch, makes `dl-album` a one-line entry, and puts failure toast in a single catch for all tree group adds.

## Implementation

### `LibraryTreePane.js`

**Dispatcher (required shape — do not extend the template ternary):**

- Build a kind→async handler map (name flexible), e.g.:
  - `artist` → `addAllForArtist(node.data?.id)`
  - `album` → `addAllForAlbum(node.data?.id)`
  - `dir` → `addAllForFolder(node.data?.path || "")`
  - `dl-album` → `addToQueue(tracksFromCatalogRecords(node.data?.tracks || []))`
- `showGroupAdd(node)` ≡ `node.kind` is a key of that map (**not** `dl-artist` this plan).
- Single `onGroupAdd(node)`:
  - Resolve handler from map; no-op if missing.
  - `try` / `await handler(node)`.
  - `catch`: `console.error(err)` then `showToast(err?.message || "Failed to add to playlist")` (or equivalent short fallback).
- Template plus button: `v-if="showGroupAdd(node)"`, `@click="onGroupAdd(node)"` only — **no** nested ternary on kind.
- Remove template dependence on separate `onAddArtist` / `onAddAlbum` / `onAddFolder` (delete those handlers or leave unused — prefer delete if nothing else references them).
- Import `tracksFromCatalogRecords` from the track model; import `addToQueue` if not already available for the `dl-album` entry; import `showToast` from the UI store.

**Product constraints:**

- Track source for downloads album: **local** `node.data.tracks` only (no `fetchAlbumTracks` / `addAllForAlbum`).
- Button `title` / `aria-label`: **“Add all to playlist”**.
- No success toast.
- Silent skip of bad catalog rows is handled inside the projector (stage 01); do not toast for partial skip.
- List-mode chrome failure UX (`DownloadsLibraryView.addAll`, `LibraryView` add-all) **unchanged** this plan.

### Unchanged

- `DownloadsLibraryView.showAddAll` stays false when tree is on.
- Leaf `TrackRow` per-track plus on `dl-track`.
- Catalog album Download group action (`showAlbumDownload` / `onDownloadAlbum`) as today.
- Folder select checkbox on `dir` rows.

### Smoke

- Downloads + tree: album row shows plus; click queues that album’s local tracks in order; works offline.
- Catalog tree artist/album/folder add still works; hard failure surfaces one toast path.
- List-mode Downloads Add all still works when layout is not tree; no new chrome toast requirement.
- No ternary growth in the group-actions template.
