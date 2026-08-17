# Stage 02: Mode bar selection and scroll

## Status
done

## Description

The browse-mode row stays one line of labeled chips. When five chips do not fit, the row scrolls horizontally and the active chip is brought into view. The lit chip is the library location’s mode, including on `/queue` (last library), so it cannot say Folders while the title says Artists.

## Rationale

Even after stage 01 restores full phone width, “Downloads” plus four other `flex: 1` chips still overflow ~360px. Selection is the other half of “tabs look wrong.” See [context/design.md](context/design.md).

## Invariants

- Chip set is unchanged: Folders, Artists, Albums, Search, and Downloads only when `downloads.enabled`.
- Labels stay visible. No wrap, no icon-only chips, no More overflow.
- Bookmarkable routes stay as they are (`router.push({ name })`).
- Desktop dual-pane still shows this bar in the library column; the same overflow rules apply there (max 480px column).

## Risks

- `flex: 1` without `flex-shrink: 0` will keep crushing labels. Use `flex: 1 0 auto` (or equivalent grow + no shrink).
- `scrollIntoView` with `block: "start"` can scroll the whole library. Must be `{ inline: "nearest", block: "nearest" }`.
- Horizontal overscroll can trigger browser back. Set `overscroll-behavior-x: contain` on the row.

## Implementation

### Files

- Create: `frontend/src/components/library/browseMode.ts` (`effectiveLibraryMode(routeMeta, lastLibraryMode)`)
- Create: `frontend/tests/library/browseMode.test.ts`
- Change: `frontend/src/components/library/useLibraryLocation.ts` (mode uses the helper)
- Change: `frontend/src/components/layout/ModeBar.vue` (`useLibraryLocation().mode`; scroll active chip into view)
- Change: `frontend/css/library.css` (`.mode-bar` / `.mode-btn` overflow rules)

### Steps

1. Add `effectiveLibraryMode(routeMeta, lastLibraryMode): string` in `browseMode.ts`: if `routeMeta.pane === "queue"`, return `String(lastLibraryMode || "folders")`; else `String(routeMeta.mode || "folders")`. No Vue imports.
2. Unit-test: library route with `mode: "artists"` → `"artists"`; `/queue` with last `"artists"` → `"artists"`; `/queue` with empty last → `"folders"`; missing `mode` on a library route → `"folders"`.
3. `useLibraryLocation`’s `mode` computed calls that helper (`route.meta` + `ui.lastLibrary.meta?.mode`). Do not change `libLoc` / path / id helpers.
4. `ModeBar` stops reading `route.meta.mode`. Use `useLibraryLocation().mode` for `:class` / `aria-selected`. Keep `useRoute` only if still needed; it is not needed for the active id.
5. Template: put a `ref` on each mode `<button>` (or one callback ref). `watch(mode, …, { flush: "post" })` plus `onMounted` calls `scrollIntoView({ inline: "nearest", block: "nearest" })` on the active button. No `behavior: "smooth"`.
6. CSS on `.mode-bar`: `overflow-x: auto`, `flex-wrap: nowrap`, `overscroll-behavior-x: contain`, hide the overlay scrollbar (`scrollbar-width: none` and the webkit equivalent). Do not change vertical padding.
7. CSS on `.mode-btn`: replace `flex: 1` with `flex: 1 0 auto` (grow when the row is wide; never shrink below the label + padding). Keep the pill shape and `.active` colors.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test -- tests/library/browseMode.test.ts
```

In a browser below 900px, downloads on:

1. `/folders` through `/downloads`: every label is fully readable; the row does not wrap; swipe reveals chips that do not fit.
2. Tap **Downloads** (or land on `/downloads`): the Downloads chip is in view and lit.
3. From `/artists`, tap Playlist then Library: title is Artists and the Artists chip is lit (not Folders).
4. At ≥900px, four/five chips still share the library column when they fit; if the column is too narrow, the row scrolls instead of overlapping the queue.

## Acceptance

- [ ] `/queue` lights the last library mode, not a hard-coded Folders.
- [ ] Five labeled chips never wrap and never clip mid-word; overflow is horizontal scroll.
- [ ] Changing mode (or opening on Downloads) leaves the active chip inside the row’s visible box.
- [ ] `browseMode.test.ts` covers library, queue+last, queue+empty, and missing mode.
- [ ] `pnpm --dir frontend typecheck` is clean.
