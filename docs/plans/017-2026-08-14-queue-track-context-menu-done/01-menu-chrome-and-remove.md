# Stage 01: Menu chrome + queue Remove

## Status
done

## Description

Land `ActionCard`, `AnchoredMenu`, and a thin `ActionMenu` picker. Wire session-queue ⋮ and desktop right-click. Items carry `run()`. Ship **Remove from queue** as the only action. No store. No `App.js` mount.

## Rationale

A mounted, unopenable overlay cannot be verified. Chrome plus the first real caller proves open → close → `run()` against `removeIndices`, which the queue already has. Later verbs are extra items, not extra infrastructure.

## Invariants

- `dialog.js` / `AppDialog` still only do confirm + prompt.
- No `stores/actionMenu.js`. `App.js` is unchanged.
- Edit mode still shows trash + drag + Clear all and still hides duration / eq. Per-row trash still removes with no confirm.
- Row click still `playIndex` when not editing, and still ignores `.row-delete` / `.row-drag`.
- Saved-playlist rows do not grow a menu.
- Browser context menu never appears on a queue row (Edit or not).
- Long-press is not implemented and does not open the menu.
- Player files that define `DESKTOP_BREAKPOINT` are unchanged.
- `queueMenuItems.js` does **not** take unused download parameters.

## Risks

- Putting both faces in one file recreates `PlaybackStatusLine`-scale branching. Keep the picker thin.
- ⋮ click bubbles into `onRowClick` and starts that track. Must `stopPropagation` and exclude `.row-menu`.
- Right-click in Edit: `preventDefault` but do **not** open.
- Index-only open state retargets after an earlier row is removed. Hold `openedKey`; close on mismatch.
- Opening the menu, then tapping Edit, would leave it up. Close when `pl.editing` becomes true.
- Reusing `.modal` as-is makes the card a bottom sheet. Dedicated centered classes.

## Implementation

### Files

- Create `src/musicweb/static/js/layout.js`
- Create `src/musicweb/static/js/components/menu/ActionCard.js`
- Create `src/musicweb/static/js/components/menu/AnchoredMenu.js`
- Create `src/musicweb/static/js/components/menu/ActionMenuItem.js` (shared row)
- Create `src/musicweb/static/js/components/menu/ActionMenu.js` (picker only)
- Create `src/musicweb/static/js/components/playlist/queueMenuItems.js`
- Change `src/musicweb/static/js/components/playlist/PlaylistView.js`
- Change `src/musicweb/templates/index.html` (`#i-more-vert`)
- Change `src/musicweb/static/css/modal.css` (card + dropdown; do not touch AppDialog rules)
- Change `src/musicweb/static/css/app.css` (⋮ visibility, callout, hit targets)
- Do **not** change `App.js`

### Steps

1. `layout.js`: export `DESKTOP_MEDIA = "(min-width: 900px)"`, `isDesktopViewport()`, and **`useDesktopViewport()`** (matchMedia + `change`). Required. New code only.
2. `ActionMenuItem.js`: one row — icon, label, `danger` / `disabled` classes. Used by both faces.
3. `ActionCard.js`: centered `role="dialog"` card, backdrop click + Escape, focus first enabled item, Tab cycles inside. Acquire `modalLock` `"action-menu"` on open; release on every close path (Escape, backdrop, item, unmount).
4. `AnchoredMenu.js`: `role="menu"` list, position from `{ kind: "point", x, y }` or `{ kind: "el", el }`, clamp/flip to the viewport. Click-outside, window scroll/resize, Escape close. ArrowUp/Down, Home/End, Enter/Space. No modal lock.
5. `ActionMenu.js`: if desktop → `AnchoredMenu`, else `ActionCard`. Props: `open`, `items`, `anchor`, `restoreEl`. Uses `useDesktopViewport()`. Crossing 900px while open emits `close`. On enabled pick: emit `close`, restore focus to `restoreEl` if mounted, **then** `await item.run()`. Disabled pick: no-op. **Do not import vue-router.**
6. CSS: new classes, `align-items: center`, fully rounded sheet. Kinship with `.dialog-sheet`. Dropdown is a compact elevated list. Z-index ~105 (above player, below `.app-dialog` 120).
7. Sprite: `#i-more-vert`.
8. `queueMenuItems.js`: `buildQueueMenuItems({ track, index, openedKey })` returns **only** `{ id: "remove", label: "Remove from queue", icon: "trash", danger: true, run }`. `run` no-ops unless `pl.tracks[index]` still matches `openedKey`, then `removeIndices([index], playIndex, stopPlayback)`.
9. `PlaylistView` local state: `menuIndex`, `menuOpenedKey`, `menuAnchor`, `menuRestoreEl`. Helper `slotKey(track)` = `track.id` or path. Open stores index + that key. `open` is false (and state cleared) if the slot no longer matches — including when a different track slides into the index. `menuItems` is `computed` only while the slot matches. Watch `route.fullPath` and close. Watch `pl.editing` and close when it becomes true. Trailing ⋮ (`icon-btn row-menu`, `aria-label="Track actions"`, `aria-haspopup` from `useDesktopViewport()`). `@click.stop` opens with `anchor: { kind: "el", el }` and `restoreEl` = the button. `@contextmenu`: always `preventDefault`; open only when not editing **and** `isDesktopViewport()`, `anchor: { kind: "point", x, y }`, `restoreEl` = that row’s ⋮. Do not open when `pl.editing`. Render `<ActionMenu>` as a child of this view.
10. CSS: `.row-list.editing .row-menu { display: none }`. `-webkit-touch-callout: none` on `#view-playlist .row`. ⋮ always visible outside Edit (not hover-only). `onRowClick` also ignores `.row-menu`.

### Verify

- `uv run --group dev pytest`
- `uv run musicweb` — queue with at least three tracks, including the current one:
  - **<900px:** ⋮ opens the centered card with one danger row. Backdrop and Escape close. Choosing Remove removes that index (current track → next plays or stop). Tap on the row (not ⋮) still plays. Right-click does not open; browser menu does not appear.
  - **≥900px:** ⋮ opens a dropdown under the button; right-click opens at the cursor. Click-outside, Escape, and scrolling the queue close it.
  - **Edit:** ⋮ gone; trash/drag unchanged; right-click only suppresses the browser menu. Opening the menu, then tapping Edit, **closes** the menu.
  - **Saved playlist rows:** no ⋮.
  - Keyboard: Tab to ⋮, Enter opens, Escape closes, focus returns to ⋮.
  - `App.js` has no `ActionMenu` import. No `stores/actionMenu.js`.

## Acceptance

- [ ] Two face components + a thin picker. No singleton store. No `App.js` mount.
- [ ] New matchMedia use goes through `layout.js`. Player breakpoint copies untouched.
- [ ] Every non-editing queue row has a ⋮ that opens the menu.
- [ ] Desktop right-click opens the dropdown; below 900px right-click is swallowed only.
- [ ] Edit: no ⋮, no menu, browser menu suppressed, existing edit actions intact.
- [ ] Items use `run()`. `PlaylistView` has no action-id switch.
- [ ] **Remove from queue** is the only item, uses `removeIndices`, no confirm, works on the playing row.
- [ ] Opening stores `{ index, openedKey }`. If an earlier row is removed and a different track inherits the index, the menu **closes** (does not retarget). `run()` no-ops on the same mismatch.
- [ ] `ActionMenu` does not import vue-router. `PlaylistView` closes on `route.fullPath` and when `pl.editing` becomes true.
- [ ] `useDesktopViewport()` exists and the picker uses it.
- [ ] Native long-press does not open anything.
- [ ] `queueMenuItems.js` has no download/nav parameters yet.
