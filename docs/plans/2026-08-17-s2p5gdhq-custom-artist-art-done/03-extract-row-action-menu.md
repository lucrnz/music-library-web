# Stage 03: Extract row action menu

## Status
done

## Description

Lift PlaylistView’s row-menu open/close/anchor/contextmenu wiring into a reusable composable that still uses `ActionMenu`. PlaylistView consumes it with no behavior change. Artist surfaces are not wired yet.

## Rationale

List, grid, and tree each need the same queue chrome (`⋯` + desktop right-click, close on route/breakpoint, restore focus). Copying PlaylistView’s block three times is how the card vs dropdown rules drift. Extract first so stage 05 only supplies items and anchors.

## Invariants

- `ActionMenu` / `ActionCard` / `AnchoredMenu` remain the only overlay. No `stores/actionMenu.ts`. No `actions` mode on `dialog.ts`.
- Desktop vs mobile chrome still follows `useDesktopViewport()` / `DESKTOP_MEDIA`. Desktop `contextmenu` is ignored below 900px (same as queue).
- The picker still does not import the router. The caller closes on route change (PlaylistView already does).
- Queue items, labels, and `slotMatches` stay in `queueMenuItems.ts`.
- No long-press.

## Risks

- Focus restore and “click ⋯ again to toggle closed” are easy to drop during the extract. PlaylistView must keep both, and must keep **index** as the toggle identity (not `slotKey`).
- Edit mode on the queue still refuses to open the menu.

## Implementation

### Files

- Create: `frontend/src/components/menu/rowActionMenu.ts` (`isDesktopContextMenu`, `nextOpenKey(currentKey, clickedKey)` — toggle same key to `""`)
- Create: `frontend/src/components/menu/useRowActionMenu.ts` (uses those helpers; Vue state only)
- Create: `frontend/tests/menu/rowActionMenu.test.ts` (desktop-only contextmenu guard; `nextOpenKey` on artist-id strings)
- Change: `frontend/src/components/playlist/PlaylistView.vue` (call the composable; keep `buildQueueMenuItems`)
- Do not add a Vue mount test.

### Steps

1. Put desktop-guard and `nextOpenKey(currentKey, clickedKey)` (same key → `""`) in `rowActionMenu.ts` and test them. Unit-test `nextOpenKey` with **artist-id** strings. Do not use it as the queue’s identity — `slotKey` is `id:${track.id}`, so two queue rows of the same track share a key and a key-toggle would close the other row.
2. `useRowActionMenu` extracts open/close/anchor/focus restore only. It does not decide toggle identity. PlaylistView keeps `if (menuOpen && menuIndex === index) close; else open` and `slotMatches`. Artist hosts in stage 05 call `nextOpenKey`.
3. PlaylistView passes `menuOpen`, `menuItems`, `menuAnchor`, `menuRestoreEl` into the existing `ActionMenu` exactly as today.
4. Preserve: close when `pl.editing` becomes true; close on route change (`watch` `route.fullPath`); close when the desktop breakpoint flips (already inside `ActionMenu`). `onContextMenu` preventDefault, no-op when not desktop.
5. Do not add artist `⋯` buttons in this stage.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually (not automated): open the queue `⋯` on a phone-width and desktop-width window; right-click a queue row only on desktop; Esc / outside click closes; Edit mode hides the menu.

## Acceptance

- [ ] PlaylistView queue menu behavior is unchanged (overflow, desktop right-click, no mobile long-press, close-then-`run()`, **index-based toggle**, `slotMatches`). Two queue rows of the same track still open independently.
- [ ] Open/close/anchor/focus lives in `useRowActionMenu`. `rowActionMenu.ts` unit tests cover `nextOpenKey` for artist ids and the desktop-only contextmenu guard. PlaylistView does not use `nextOpenKey` as the queue’s identity.
- [ ] No new overlay system and no artist UI yet.
