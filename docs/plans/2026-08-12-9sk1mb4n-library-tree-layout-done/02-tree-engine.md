# Stage 02: Tree engine (view, session expand, lazy cache, visible nodes)

## Status
done

## Description

Build **one** recursive tree engine used by every mode and by Download Manager chrome: presentational rows, session expand/collapse, lazy child cache with inline error + Retry, and a **visible-nodes** projection shared by render and (later) keyboard. No per-mode tree forks.

## Rationale

Thermo-nuclear review: four mode trees plus manager is the primary structural failure mode. A single engine with adapters deletes entire categories of duplicated expand/error/keyboard logic and keeps hosts thin.

## Implementation

### Module layout (suggested)

Under `static/js/components/tree/` (shared, not buried only under library):

- `TreeView.js` — recursive render; slots for group label, group actions, leaf row.
- `treeSession.js` — session-only expand sets + child cache; **not** `stores/ui.js`.
- `flattenVisible.js` (or method on session) — pure `flatten(roots, isExpanded, getChildren) → visible[]` with parent links / depth for a11y.
- CSS: neutral `.tree-*` classes (manager density); prefer `static/css/tree.css` imported with the app.

### Contracts

- **TreeSource** (adapter interface, documented in JSDoc):
  - `listRoots(): Promise<Node[]>` or sync
  - `loadChildren(node): Promise<Node[]>`
  - `key(node): string`
  - `isLeaf(node): boolean` (or kind)
  - optional cover/title/subtitle helpers
- **treeSession**:
  - expand/collapse by key; default collapsed
  - `ensureChildren(key, loader)` — coalesce in-flight; status `idle|loading|ready|error`; Retry clears error and reloads
  - `collapseAll()` / per-scope reset for mode switches
- **TreeView**:
  - props: roots or source, session, action slots
  - group: chevron + label both toggle expand (manager-like)
  - expanded + error → inline message + Retry button
  - leaves: default slot / render fn so `TrackRow` / `FileRow` / manager compact row plug in without a pass-through `TreeTrackRow` wrapper

### Hard rules

- No tree expand/lazy logic inside `LibraryView` / `DownloadsLibraryView` / `DownloadsModal` beyond mounting `TreeView` + a source.
- Do not add tree as a fake `LibraryBody` kind inside `EntityListHost` — tree is a sibling view.
- Avoid thin identity wrappers; reuse existing row components via slots.

### Manager

- Refactor `DownloadsModal` onto `TreeView` + a downloads hierarchy source (delete actions in group/leaf slots). Modal should **shrink**, not just rename CSS.

### Smoke

- Engine works with a minimal mock source or manager data; expand loads once; fail → Retry; collapseAll; visible flatten matches on-screen nodes.
