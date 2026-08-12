# Stage 03: Tree navigation policy (coerce, focus path, snapshot)

## Status
done

## Description

Land a **pure** `treeNavigation` policy module **before** (or with the first) full library tree body, so the invariant holds from the first real tree pixel: while layout is Tree, the router stays on **mode root**; enter/leave and cold-start rules are one place, not ad-hoc watches in views.

## Rationale

Route + snapshot + auto-expand is the highest spaghetti risk. Pure transition functions keep views dumb (`apply(result)`) and make the locked product matrix testable without mounting Vue.

## Implementation

### Ownership

- Module e.g. `static/js/components/tree/treeNavigation.js` (+ tiny reactive session for snapshot/focus if needed).
- **Enter snapshot lives here** (or adjacent tree session) — **not** `ui.js`.
- Views call policy on layout change / route change / mode change; they do not invent parallel flags.

### Locked product rules (encode as pure cases)

| Event | Result |
|-------|--------|
| Layout → tree from list/grid | If no snapshot yet this session, save current library route; derive focus path from that route; `replace` to mode root if drilled in; set expand path |
| Cold start layout already tree + deep URL | Coerce to mode root + focus path; **do not** set leave-restore snapshot |
| Layout → list/grid | If snapshot exists, `replace` to snapshot and clear it; else stay on current mode root |
| ModeBar while tree | Navigate to new mode **root**; `collapseAll` for tree session; **do not** clear enter snapshot |
| Leave tree after mode switch | Still restore **original** snapshot (may change mode) |

### Focus path derivation

- Folders `?path=a/b` → segments `["a","b"]` for auto-expand.
- `/artists/:artistId` → expand artist.
- `/albums/:albumId` → expand album (Albums tree).
- Downloads artist/album routes → expand corresponding offline nodes.
- Auto-expand runs after roots ready: sequential ensure+expand ancestors, then `scrollIntoView` on deepest focus node.

### View wiring (thin)

- `LibraryView` / `DownloadsLibraryView`: watch layout+route → `treeNavigation.handle(...)` → apply route replaces + pass `initialExpandPath` into tree session once.
- No multi-page “tree only at roots until later” temporary branch — policy is active when tree is selectable.

### Smoke matrix

1. List `/artists/ART1` → Tree → `/artists`, ART1 expanded + scrolled; List → `/artists/ART1`.
2. Folders `?path=a/b` → Tree → root expand a→b; leave restores path.
3. Reload deep URL + stored tree → coerce+expand, leave stays root (no snapshot).
4. Enter tree from ART1 → ModeBar Folders (collapsed) → List → `/artists/ART1`.
