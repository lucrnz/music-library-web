# Stage 04: Typed TreeNode

## Status
done

## Description

Replace `TreeNode.kind: string` + `data?: unknown` with a discriminated union (`artist` / `album` / `track` / `dir` / `file`) in `treeNode.ts`. Construction sites emit the matching member. Hosts stop casting.

## Rationale

Every library/tree cover and menu path duck-types `node.data`. A union deletes that cast tax and is required before the downloads snapshot caches packed roots.

## Invariants

- Tree kinds stay `artist` / `album` / `track` / `dir` / `file`. Downloads tree stays artist → album → track.
- `treeNodeId` / `treeNodePath` keep the same results for those kinds.
- List/tree hosts stay separate (`LibraryView` and `LibraryTreePane` are not merged).

## Risks

- Vue templates that do `node.data as Track` will fail typecheck until the leaf slot is narrowed (`v-if="node.kind === 'track'"` already exists — use that narrowing).
- Re-exporting the old type from `artistsSource.ts` would hide missed import updates. Do not re-export; move the type and fix imports.

## Implementation

### Files

- frontend/src/components/tree/treeNode.ts
- frontend/src/components/tree/sources/artistsSource.ts
- frontend/src/components/tree/sources/albumsSource.ts
- frontend/src/components/tree/sources/foldersSource.ts
- frontend/src/components/tree/sources/downloadsSource.ts
- frontend/src/components/tree/TreeView.vue
- frontend/src/components/tree/treeSession.ts
- frontend/src/components/tree/flattenVisible.ts
- frontend/src/components/tree/LibraryTreePane.vue
- frontend/src/components/library/browseSource.ts
- frontend/src/components/library/sources/onlineBrowse.ts
- frontend/src/components/library/sources/downloadsBrowse.ts
- frontend/src/downloads/snapshot.ts
- frontend/src/components/downloads/DownloadsModal.vue
- frontend/tests/tree/flattenVisible.test.ts
- frontend/tests/tree/downloadsMenuMap.test.ts
- frontend/tests/library/browseSource.test.ts

### Steps

1. Add `frontend/src/components/tree/treeNode.ts` with the discriminated `TreeNode` union and `treeNodeId` / `treeNodePath` as field access (`artist`/`album`/`track` → `data.id`; `dir`/`file` → path).
2. Remove the old `TreeNode` interface and helpers from `artistsSource.ts`. Construct `kind: "artist" | "album" | "track"` members with typed `data`.
3. Update `albumsSource.ts`, `foldersSource.ts` (`dir` + `file` + `FileRowModel`), and `downloadsSource.ts` / `snapshot.ts` packed roots to the union.
4. Point `TreeView.vue`, `treeSession.ts`, `flattenVisible.ts`, `browseSource.ts` imports at `treeNode.ts`.
5. `LibraryTreePane.vue`: `targetFromNode` / `artistFromNode` / `fileFromNode` / leaf activate switch on `kind` with no `as Artist` / `as Track` / `as LibraryAlbum`.
6. `onlineBrowse.cover` and `downloadsBrowse.cover` narrow `target.kind === "tree"` the same way.
7. `DownloadsModal.vue`: import `TreeNode` from `treeNode.ts`; leaf helpers narrow on `kind`.
8. Fix tests that import `TreeNode` from `artistsSource.ts`.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test -- tests/tree/flattenVisible.test.ts tests/tree/downloadsMenuMap.test.ts tests/library/browseSource.test.ts`

## Acceptance

- `rg -n "data\\?: unknown|kind: string" frontend/src/components/tree` is empty.
- `rg -n "as Artist|as LibraryAlbum|as Track|as FileRowModel" frontend/src/components/tree frontend/src/components/library/sources frontend/src/downloads/snapshot.ts` is empty.
- `rg -n "from \\\"@/components/tree/sources/artistsSource\\\"" frontend/src` no longer imports `TreeNode` from there.
- Typecheck is clean. Flatten / browseSource / downloads menu-map tests pass.
