# Stage 05: Filesystem room chrome

## Status
done

## Description

Replace the desktop CD right pane (and narrow `/cd`) with the Yellow Book room: filesystem on top (List/Grid/Tree), CD-local queue on the bottom, resizable split, library verbs, LossyMark on the three surfaces.

## Rationale

Stage 04 can play; this is the product surface that replaces **Not an audio CD**.

## Invariants

- Red Book still mounts `CdTrackList` only. Yellow Book never uses `PlaylistView` or `pl`.
- List/Grid/Tree reads `ui.libraryLayout` (same pref as the library). Tree nodes are a **private** CD type (folder | file). Do not import `components/tree/treeNode.ts` and do not extend the library `TreeNode` union.
- Filesystem List/Grid: new rows in `components/cd/` (VA thumb + [label format](context/disc-files.md) + `LossyMark`). Do **not** mount `TrackRow` or `AlbumCard` — those write `pl` and `become("queue")`.
- Folders: `<Icon name="folder" />` (`#i-folder`) + directory name. No folder art in this pane.
- Queue: `CdRomQueue.vue` copies on-demand **row chrome** only (cover, title, artist - album, duration, ⋯, drag, Edit/Clear, Radio+CD toggle, `LossyMark`). No `PlaylistView`, no Save/Download/Go to. Do not import `queueMenuItems.ts`. Extract a dumb drag/edit list helper only if that chrome would be copied twice in this stage — do not extract as a prerequisite.
- List/Grid navigation is Back + current folder title (volume name at root). Tree expands in place.
- Add all pill on the current folder / root; Play all on ⋯; folder Add all is recursive.
- Desktop split height persists as `musicweb.cdromSplitHeight.v1`. Narrow `/cd` stacks the same two panes under CD now-playing.
- `LossyMark` on filesystem rows, queue rows, and now-playing (already wired in 04 via `isLossy`). No `hideLossyMark` prop.

## Risks

- Reusing `PlaylistView` “because it looks like a queue” would bring Save / Download / saved lists and occupy `pl`.
- Sharing `libraryLayout` means changing Mode in the library pane also changes the disc tree — that is intended.

## Implementation

### Files

- `frontend/src/components/App.vue`
- `frontend/src/components/cd/CdView.vue`
- `frontend/src/components/cd/CdRomPane.vue`
- `frontend/src/components/cd/CdFilesystem.vue`
- `frontend/src/components/cd/CdRomQueue.vue`
- `frontend/src/components/cd/CdNowPlaying.vue`
- `frontend/src/components/cd/cdromMenuItems.ts`
- `frontend/src/components/cd/cdromTree.ts`
- `frontend/src/components/cd/CdRomFileRow.vue`
- `frontend/src/components/cd/CdRomFolderRow.vue`
- `frontend/src/stores/ui.ts`
- `frontend/css/cd.css`
- `frontend/tests/cd/cdromMenuItems.test.ts`
- `frontend/tests/cd/cdromLabel.test.ts`

### Steps

1. Persist split height on `ui` in `frontend/src/stores/ui.ts` (`musicweb.cdromSplitHeight.v1`), same null-default / number pattern as `libraryPaneWidthPx`.
2. Add `frontend/src/components/cd/CdFilesystem.vue`: List/Grid via `CdRomFileRow.vue` / `CdRomFolderRow.vue` (VA thumb, `#i-folder`, `LossyMark`, [label format](context/disc-files.md)). Tree via a private node type in `frontend/src/components/cd/cdromTree.ts` — do not import `treeNode.ts` / `TreeView.vue`. Wire layout from `ui.libraryLayout`. Back + title. Add all pill. File click → `cdromPlayOrQueue`. Desktop `contextmenu` / ⋯ from `cdromMenuItems.ts`.
3. Add `frontend/src/components/cd/CdRomQueue.vue`: on-demand queue row chrome (cover from the 04 helper, title, artist - album, duration, ⋯, drag, Edit/Clear, `LossyMark`) but no saved-playlist block, no Save/Download/Go to. Header still has Radio + CD session toggle. Empty copy: **Add some files to start CD playback**.
4. Add `frontend/src/components/cd/CdRomPane.vue`: vertical split (filesystem, queue), drag handle, persist height. Use it from `frontend/src/components/App.vue` when `desktop && cdEntryAllowed() && session === "cd" && mediaKind === "data"`; this **replaces** the stage-04 dumb `CdTrackList` for data. Leave the Red Book track-list host on audio discs.
5. `frontend/src/components/cd/CdView.vue`: if data, stack now-playing + filesystem + queue; if audio, keep today’s now-playing + `CdTrackList`.
6. `frontend/css/cd.css`: split, stack, empty queue, folder/file rows. File icon URL is `/static/img/va-artist-thumb.webp` (shipped in 04).
7. Tests: `frontend/tests/cd/cdromLabel.test.ts` for the format fallbacks; `frontend/tests/cd/cdromMenuItems.test.ts` for Add / Add all / Play all and no Download/Save/Go to.

### Verify

- `pnpm --dir frontend test -- frontend/tests/cd/cdromMenuItems.test.ts frontend/tests/cd/cdromLabel.test.ts frontend/tests/stores/cd.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "LossyMark" frontend/src/components/cd/CdRomFileRow.vue frontend/src/components/cd/CdRomQueue.vue` hits the mark.
- `rg -n "TrackRow|AlbumCard|PlaylistView|treeNode" frontend/src/components/cd` is empty.
- `rg -n "hideLossyMark" frontend/src` is empty.

## Acceptance

- Desktop data disc: library left, split CD room right (filesystem over queue). Red Book disc: `CdTrackList` as today.
- Narrow `/cd` with a data disc stacks filesystem + queue.
- Switching library List/Grid/Tree changes the disc pane.
- Play all on a folder replaces the CD queue and starts playback.
- Queue Edit can reorder and clear. No Save / Download / Go to.
- MP3 / AAC / WMA rows show `LossyMark`; ALAC / FLAC do not. File icon is the VA thumb; folders use `#i-folder`.
- Empty multi-folder disc shows the add-files copy.
