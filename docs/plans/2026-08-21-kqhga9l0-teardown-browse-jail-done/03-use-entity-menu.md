# Stage 03: Extract useEntityMenu

## Status
done

## Description

Extract the open/key/context/header-menu block into `useEntityMenu`. Switch `LibraryView`, `DownloadsLibraryView`, and `LibraryTreePane`. Builders and `OpenMenu` stay. Both list SFCs still exist.

## Rationale

The host merge in stage 04 will fail if it also has to invent the menu composable. Extracting first deletes two of the three copies while App.vue is unchanged, so the extract is shippable on its own.

## Invariants

- `useRowActionMenu` still owns anchor/focus only. `useEntityMenu` owns key/target/toggle and calls `openMenu` / `closeMenu`.
- Menu item builders (`artistMenuItems`, `albumMenuItems`, `trackMenuItems`, `folderMenuItems`) stay in their files. Hosts pass `run`s.
- Tree `targetFromNode`, `asTrack`, and `dl-*` kinds do not change.
- No `stores/actionMenu.ts`. Close on route/layout change stays the caller’s `watch` (or a `watch` inside `useEntityMenu` that the host still triggers by passing deps — either is fine; do not import the router into the composable).

## Risks

- Tree uses `onLeafMenuClick` with an already-built `OpenMenu` as well as `onNodeMenuClick` from a node. The composable must expose both `openEntityMenu(target, anchor, restoreEl)` and the click/context helpers.
- Header `⋯` uses the same `onEntityMenuClick`. Keep `headerMenuTarget` computed in the host (or a tiny helper next to `OpenMenu`); do not put artist/album header policy in the composable.

## Implementation

### Files

- `frontend/src/components/library/useEntityMenu.ts` (new)
- `frontend/src/components/library/entityMenu.ts` (keep `OpenMenu` / `openMenuKey`; add header-target helper only if it stays pure)
- `frontend/src/components/library/LibraryView.vue`
- `frontend/src/components/downloads/DownloadsLibraryView.vue`
- `frontend/src/components/tree/LibraryTreePane.vue`
- `frontend/tests/library/useEntityMenu.test.ts` (new) or extend `entityMenuItems.test.ts`

### Steps

1. Move `menuKey`, `menuTarget`, `closeEntityMenu`, `openEntityMenu`, `onEntityMenuClick`, `onEntityContext` from `LibraryView` into `useEntityMenu({ itemsFor })`. Reuse `nextOpenKey` + `openMenuKey` + `isDesktopContextMenu` as today. Return `{ menuOpen, menuItems, menuAnchor, menuRestoreEl, menuKey, menuTarget, closeEntityMenu, openEntityMenu, onEntityMenuClick, onEntityContext }`.
2. Switch `LibraryView` to the composable. `itemsFor` is today’s `menuItems` switch. Keep the `watch` that closes on `route.fullPath` / layout / `showTree`.
3. Switch `DownloadsLibraryView` the same way (its `itemsFor` has no folder/file/photo).
4. Switch `LibraryTreePane`: `onNodeMenuClick` / `onLeafMenuClick` / row context call `openEntityMenu` / `onEntityContext`. Do not rewrite `targetFromNode`.
5. Delete the duplicated functions from the three SFCs. Grep for `nextOpenKey` — only the composable and its tests should call it for entity menus.

### Verify

- `rg -n "function openEntityMenu|function onEntityContext|function closeEntityMenu" frontend/src` — definitions only in `useEntityMenu.ts`.
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- The three surfaces import `useEntityMenu`. None reimplements `nextOpenKey` toggle.
- `DownloadsLibraryView.vue` still exists (stage 04 deletes it).
- Tree menu still opens from group `⋯`, leaf `⋯`, and desktop `contextmenu` with the same `OpenMenu` kinds as today.
- Typecheck and frontend tests pass.
