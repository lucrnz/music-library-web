# Stage 04: Shared browse layout (library composables)

## Status
done

## Description

Deduplicate list/grid/tree wiring between `LibraryView.js` and `DownloadsLibraryView.js` via composables under **`components/library/`**.

1. **`browseChrome.js` (or equivalent)** — pure helpers only  
   Inputs: layout mode, route/location snapshot, body kind, pane scope (`library` | `downloads`).  
   Outputs: `showTree`, `showLayoutToggle`, `isGrid`, `gridHost`, and any other flags currently copy-pasted.

2. **`useBrowseLayout.js`** — **single layout machine**  
   Owns `prevLayout` / `prevTreeMode`, `replaceRoute`, and **all** wiring to `handleLayoutTransition` / `handleTreeRoute` (mount + layout watch + route watch pieces that are shared).  
   Does not own data loading.

3. **Views keep adapters only** — `loadLibraryPage` vs `loadDownloadsView`, pane-specific actions, library search, open/back navigation that is data-specific.

Prefer this composable cut over a single `BrowsePaneHost` SFC unless template duplication remains painful after the hook lands.

### Done when (non-negotiable)

- Layout transition + tree-route orchestration live **only** in `useBrowseLayout` (no parallel copy of that state machine left in either view).
- Chrome flags come **only** from pure helpers (or computed wrappers that call those helpers) — not re-derived ad hoc in each view.
- Both views **measurably shrink**; a reader should not find two full layout machines.
- If extraction would leave a thin pass-through hook while both views still own the real logic, **stop and finish the move** — do not ship a wrapper layer.

## Rationale

Tree **policy** already lives in `treeNavigation.js`; both panes still re-implement the same **layout machine**. Adding a hook without deleting the dual watchers is rearrange-not-delete. The success bar forces deletion of the second machine.

## Implementation

1. Diff the two views for shared computeds/watchers; list every line that must move into the hook/helpers.
2. Extract pure chrome helpers; check folder root, album detail, search, downloads-album, tree vs list.
3. Implement `useBrowseLayout` under `components/library/`; both views call it and **delete** local duplicates.
4. Browser-verify: list ↔ grid ↔ tree on library and downloads; leave-tree snapshot restore; deep route coerce + focus in tree; search non-tree on library.
