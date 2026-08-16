# Stage 01: Layout store and Finder-style menu

## Status
done

## Description

Extend global `libraryLayout` to `"list" | "grid" | "tree"` and replace the binary cycle toggle with a Finder-style List / Grid / Tree menu in library chrome. **Do not** treat Tree as list under the hood. Prefer enabling the Tree menu item only once the TreeView shell exists (this stage may land menu chrome for list/grid immediately and add the Tree item in the same PR as stage 02 shell, or ship menu + shell together — never `layout===tree` → list body).

## Rationale

Layout preference and menu UX are independent of hierarchy data. Landing them first unblocks selection persistence and chrome a11y without inventing temporary layout lies that become permanent debt.

## Implementation

- `stores/ui.js`:
  - Widen `LibraryLayout`; load/save `"tree"` on existing storage key.
  - `setLibraryLayout(mode)` is the only mutator; remove `toggleLibraryLayout` callers.
  - **Do not** store expand maps, child caches, or enter snapshots here — only `libraryLayout`.
- `LibraryChrome`: icon button + menu (pattern after `QualitySelect`): open/outside click/Escape; icons for list/grid/tree; check current; `aria-haspopup` / `aria-expanded`; basic keyboard (finish polish in stage 06 if needed).
- Add tree layout icon to SVG sprite.
- `LibraryView` / `DownloadsLibraryView`: drop cycle icon/label props; pass `showLayoutToggle` only (same visibility as today: not search, not album track-only pages, not queue).
- Hard gate: if Tree is selectable, a TreeView shell must render (empty roots OK). If shell is not in this commit, hide/disable Tree in the menu.
- Smoke: list/grid persist and render; menu a11y basics; no code path where tree layout silently means list.
