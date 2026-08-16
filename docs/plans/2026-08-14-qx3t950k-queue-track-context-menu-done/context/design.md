> **Archive.** Decisions in this file were current as of 2026-08-14 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Queue track context menu

## Goal

Give session-queue track rows a real context menu (overflow + desktop right-click) for remove, per-track download, and jump-to album/artist — without changing Edit mode, and without a global menu store.

## Settled decisions

### Product

- **Surface this iteration:** session queue rows in `PlaylistView` only. Not saved-playlist rows, not library `TrackRow`, not now-playing chrome.
- **Edit mode stays.** Trash, drag-to-reorder, and Clear all are unchanged. The menu does not open in Edit; the overflow button is hidden there.
- **Menu is a shortcut**, not a replacement. Remove uses the same `removeIndices` path as Edit (no confirm; removing the current track plays whatever lands on that index, or stops).
- **Open set:** overflow (⋮) on every queue row at both breakpoints, plus right-click when the viewport is desktop. No long-press.
- **Keyboard / SR:** the ⋮ is a real `button` (Tab, Enter/Space). Rows stay unfocusable tap-to-play targets.
- **Which chrome:** `(min-width: 900px)` — the same layout breakpoint as the dual-pane shell. Below: centered card. At or above: dropdown (cursor-anchored on `contextmenu`, button-anchored on ⋮ click). Not pointer-type, not “follow the trigger.”
- **Mobile card:** centered action list that *looks like* AppDialog. No track identity header. No OK/Cancel. Backdrop + Escape dismiss. `AppDialog` / `dialog.js` stay confirm/prompt only.
- **Desktop dropdown:** actions only, clamped/flipped to the viewport.
- **Items:** icon + label.
- **No identity chrome.** The user already knows which row they opened.
- **Native leftovers:** suppress callout/selection on queue rows. Always `preventDefault` on `contextmenu` for queue rows, including in Edit.
- **Missing actions:** hide anything that does not apply. Busy download stays visible and disabled (`Downloading…`). Failed stays enabled as Retry.
- **Go to artist** uses `track.artistId` only. Hide if null. No `albumArtistId` fallback.
- **Go to album** hides if no `albumId`.
- **Order / copy:** Go to album → Go to artist → Download family → **Remove from queue** (danger, last). Never “Delete.” Never “song.”
- **Download family:**
  - Hide if downloads are off, the track is missing, or it has no id.
  - `none` / `other` → **Download** via `downloadTrack` (quota confirm if needed).
  - `pending` / `active` / `paused` → **Downloading…** disabled.
  - `failed` → **Retry download** via `downloadTrack`.
  - `ready` → **Remove download** via `confirmRemoveDownloadedTrack`, then `removeDownloadedTrack`. Icon `download-check` (not `trash`).
- **Navigation:** close the menu, `router.push` the existing library album/artist route, no toast. Mobile leaves the Queue tab. Desktop updates the library pane.
- **Confirm stacking:** close the menu *before* any `confirmDialog` (quota or remove-download). One menu at a time.

### Structure

- **No `stores/actionMenu.js`.** No `App.js` mount. `PlaylistView` owns `open` / `anchor` / `restoreEl` and renders the menu.
- **The reusable primitive is presentational components**, not a singleton. A second caller (library rows) can mount its own later; do not extract a store in this plan.
- **Two faces, thin picker:** `ActionCard` (mobile dialog) + `AnchoredMenu` (desktop menu) + `ActionMenu` as a ~10-line picker. Shared row renderer. Do not put both faces in one branching file.
- **Items carry `run()`.** Shape: `{ id, label, icon, danger?, disabled?, run }`. `id` is a list key, not a protocol. The menu closes, then `item.run()`. No `onAction` switch in `PlaylistView`. `download` and retry are one item (same `run`).
- **Open-slot identity:** local state is `{ index, openedKey, anchor, restoreEl }`. `openedKey` is `track.id` or path, captured at open. If `pl.tracks[index]` no longer matches `openedKey`, **close** — do not rebuild the menu for whoever inherited the index. `menuItems` is a `computed` from that still-matching slot. `run()` double-checks the same key.
- **New desktop helper** for new code: `layout.js` exports `DESKTOP_MEDIA`, `isDesktopViewport()`, and **`useDesktopViewport()`** (matchMedia + `change`). Required, not optional. Do **not** migrate existing player `DESKTOP_BREAKPOINT` copies.
- **Canonical download helpers:** `confirmRemoveDownloadedTrack` lives in `downloads/ui.js`. A shared join maps `trackDownloadState` → `{ kind: "hide" | "download" | "busy" | "retry" | "ready" }` **only** — no icon, disabled, label, or title. Callers map kind → their own glyph / disabled / copy. `DownloadIcon` maps kind → its titles. The queue builder maps kind → menu label / icon / disabled / `run`, and specializes `ready` → Remove download / `download-check`.
- **Close on route change** lives in `PlaylistView` (`route.fullPath`). `ActionMenu` does not import the router.
- **Close on Edit.** `PlaylistView` closes and clears menu state when `pl.editing` becomes true. The menu must not stay up after Edit is entered.

## Design

The expensive part is the interaction model, not the four verbs. Land two small chrome faces and teach the queue to open them. Do not invent a fourth global overlay.

**Ownership.** `PlaylistView` local state: `menuIndex`, `menuOpenedKey`, `menuAnchor` (`{ kind: "point", x, y }` or `{ kind: "el", el }`), `menuRestoreEl`. `open` is `menuIndex >= 0` **and** the slot still matches `menuOpenedKey`. On mismatch, `route.fullPath` change, or `pl.editing` becoming true, close and clear. `<ActionMenu>` is a child of the queue view, not of `App`. It does not import vue-router.

**Picker.** `ActionMenu.js` chooses `ActionCard` vs `AnchoredMenu` with `useDesktopViewport()` from `layout.js`. Crossing 900px while open **closes** (anchor geometry is stale). `aria-haspopup` on the ⋮ follows that bit (`menu` on desktop, `dialog` below — or `true` if you refuse to lie).

**Card vs menu.** `ActionCard`: centered, `role="dialog"`, backdrop, Tab cycle, focus first enabled item, `modalLock` token `"action-menu"` only while the card is up. Dedicated classes — do **not** reuse `.modal`’s `align-items: flex-end`. Visual kinship with `.app-dialog .dialog-sheet` (surface, radius, type). `AnchoredMenu`: `role="menu"`, clamp/flip, click-outside, scroll/resize dismiss, arrow keys. No modal lock. Shared row: icon + label; danger uses `--danger`; disabled is inert.

**Close, then `run`.** Enabled item: close (lock released, focus → `restoreEl` if mounted), then `await item.run()`. Disabled: ignore, stay open. `run` closures do the work (remove, download, navigate). Each `run` no-ops unless `pl.tracks[index]` still matches the `openedKey` captured at open.

**Queue builder.** `queueMenuItems.js` is the only owner of item order and `run` wiring. Stage 01 emits Remove only — **do not** take unused download parameters. Later stages append/prepend in the same function. Builder reads download stores itself when that stage lands so labels stay live **for the opened slot only**.

**Queue row chrome.** Custom queue rows (not `TrackRow`) gain a trailing ⋮, always visible except in Edit. Row `@click` ignores `.row-menu`. `contextmenu` always `preventDefault`; open only when not editing **and** desktop. CSS: `-webkit-touch-callout: none` on queue rows. Focus restore: ⋮ click → that button; right-click → that row’s ⋮.

**Z-index.** Above the player, below AppDialog (120). Close before confirms.

**Icons.** `more-vert` for overflow. `trash` only on Remove from queue. Download family: `download` / `download-check`. `album` / `artist` when those actions land.

**Helpers, not copies.** New matchMedia call sites import `layout.js`. Remove-download confirm is one function, two callers (Downloads manager + queue). Download **kind** join is one module, two callers; each caller owns strings, icons, and disabled.

## Stage map

Chrome and the first caller land together so nothing mounts unused.

1. **Menu chrome + queue Remove** — `layout.js`, `ActionCard` / `AnchoredMenu` / picker, queue ⋮ + desktop right-click, items with `run()`, Remove only. Proves open → close → act against `removeIndices`.
2. **Download family** — extract confirm + kind-only join; each caller maps kind → its own copy/glyph/disabled; queue `ready` → Remove download / `download-check`.
3. **Go to album / artist** — prepend nav items; existing library routes.
4. **Frontend conventions** — persist “component primitive, no store, 900px helper, close-before-confirm.” Last so it describes what shipped.

## Out of scope

- `stores/actionMenu.js` and an `App.js` menu mount.
- Long-press as an open gesture.
- Replacing or shrinking Edit mode.
- Library `TrackRow` / file rows / saved-playlist rows / now-playing.
- Play now, Play next / insert-after-current, add to saved playlist, show in folder, lyrics, favorites.
- Track-identity header on either surface.
- Extending `AppDialog` / `dialog.js`.
- JS test-runner / Vitest / Node toolchain.
- Migrating existing player `DESKTOP_BREAKPOINT` copies.

## Assumptions

- Session queue identity is index-based (`pl.tracks` + `pl.index`); there is no queue-item UUID.
- `removeIndices`, `downloadTrack`, `removeDownloadedTrack`, `trackDownloadState`, and album/artist routes already exist and stay the handlers.
- Frontend verification is pytest (no regressions) plus in-browser checks; there is no JS unit-test harness.
- Layout desktop is `min-width: 900px` (`desktop.css` and the player `matchMedia` copies).
