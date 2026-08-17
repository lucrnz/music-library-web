**Archive.** Decisions in this file were current as of 2026-08-17 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Fix mobile tabs

## Goal

On a phone, one library or queue pane at a time, with browse-mode chips that stay readable and match the library title. Queue header actions stay on one row.

## Settled decisions

- **Scope.** Restore single-pane mobile switching, make the Folders / Artists / Albums / Search / Downloads chips fit a phone, and light the chip that matches the library title. Queue header overflow is in scope: icon-only actions below 900px.
- **Mode chips.** One horizontal row, labels kept, no wrap. Chips size to their text and may grow when there is spare width; they must not shrink below the label. The active chip scrolls into view. Same pattern as Spotify / YouTube Music chip rows. Downloads stays a fifth chip when downloads are enabled.
- **Selected chip on `/queue`.** Same source as the library pane title: `useLibraryLocation()` / last library snapshot. Not raw `route.meta.mode` (missing on `/queue`, so Folders was lit while the title said Artists).
- **Queue actions below 900px.** Download / Save / Edit / Clear all become icon buttons with `aria-label`. Desktop (≥900px) keeps labeled pills.
- **Panes stay mounted.** Mobile still toggles `.hidden`; desktop still forces `.view.hidden { display: flex !important }` at `(min-width: 900px)`. Do not `v-if` unmount a pane.
- **No breakpoint change.** `DESKTOP_MEDIA` / `(min-width: 900px)` stays the dual-pane line.

## Design

The screenshot in [bug-screenshot.png](bug-screenshot.png) is a phone with the bottom Library / Playlist bar still showing, so the viewport is below 900px. Both panes are on screen as equal `flex: 1` columns. Five `flex: 1` mode chips then crush into half the width and collide with the queue’s “Saved playlists appear here” line. Download / Save hang off the header. The title says Artists while Folders is lit.

**Why both panes show.** `App.vue` puts `:class="{ hidden: onQueue }"` on `LibraryView`. After the artist-menu work, `LibraryView` is a fragment (`LibraryChrome` + sibling `ActionMenu`). Vue 3 does not fall through `class` onto a fragment, so `#view-library` never gets `.hidden`. `main` is a row flex; both `.view` children take half the width. `PlaylistView` is a single root, so its `hidden` bit works — the leak is the library pane staying visible on `/queue`, and the half-width crush whenever both happen to paint.

**Pane switching.** Keep the existing class contract. Make `LibraryView` a single root so fallthrough lands on `#view-library`: mount `ActionMenu` inside `LibraryChrome` (overlay slot at the end of the `<section>`), matching `PlaylistView` (menu already inside `#view-playlist`). `ActionCard` already `Teleport`s to `body`, so an open menu is not clipped by the section. Do not wrap the pane in a non-`.view` host — desktop visibility is `.view.hidden { display: flex !important }`.

**Mode bar.** `ModeBar` calls `useLibraryLocation()` and uses `mode` for `aria-selected` / `.active`. Extract the tiny pure rule (`queue` → last library mode, else `route.meta.mode`, default `"folders"`) so the composable and a node unit test share it. CSS: `overflow-x: auto`, `flex-wrap: nowrap`, `overscroll-behavior-x: contain`, overlay scrollbar hidden. `.mode-btn` is `flex: 1 0 auto` (grow when they fit, never shrink below the label). On `mode` change, `scrollIntoView({ inline: "nearest", block: "nearest" })` on the active button.

**Queue header.** Add a `save` symbol to the existing `index.html` sprite (`#i-save`; `Icon` already does `#i-` + name). Save and Clear all gain icons (Clear all uses `trash`). Mobile-first CSS hides `.pill span` inside `#view-playlist .view-actions` and tightens padding; `(min-width: 900px)` shows the labels again. No second row, no overflow menu.

## Stage map

Pane switching first: later stages are verified at full phone width, and the screenshot’s chip collision is mostly the half-width leak.

1. **Restore mobile pane switch** — `hidden` must land on `#view-library` or every later mobile check is lying.
2. **Mode bar selection + scroll** — chips are the named “tabs.” Selection is independent of 01 in code but is checked after the library pane is the full width again.
3. **Queue header icons** — independent of the mode bar; same full-width verify as 02, so it follows.
4. **Living docs** — last, so conventions describe what shipped.

## Out of scope

- Changing the 900px desktop breakpoint or showing the bottom tab bar on desktop.
- Removing Downloads from the mode bar, wrapping chips, or icon-only mode chips.
- Unmounting panes with `v-if`.
- A new Vue mount / browser layout test (existing rule: not Vue chrome).
- Redesigning saved-playlist chrome or the mini-player.

## Assumptions

- The live screenshot is the current SPA (Vite-built CSS still hides `#tab-bar` only at `width >= 900px`).
- `downloads.enabled` is on in the screenshot (fifth chip + Download pill).
- `ActionMenu` inside `#view-library` does not change menu lock, teleport, or close-on-route behavior.
