# Stage 04: Living docs

## Status
done

## Description

Write the mobile chrome rules into `docs/frontend/conventions.md` (and a one-line product note if the experience list is still only “bottom tabs”). This plan directory is not living documentation.

## Rationale

The fragment/`hidden` footgun and the chip-row / queue-icon rules will outlive these stage files. The next pane change should not reintroduce a second `LibraryView` root.

## Invariants

- Do not copy CSS property lists or sprite path data into docs. Point at `LibraryView.vue`, `ModeBar.vue`, `layout.ts`, and `frontend/css/library.css`.
- Prefer editing `docs/frontend/conventions.md` over adding a system page.
- `docs/README.md` does not gain a new entry.

## Risks

- Documenting “always put `hidden` on the component” without saying the class must land on `.view` will recreate the desktop dual-pane miss (wrapper without `.view` stays `display: none` at ≥900px).

## Implementation

### Files

- Change: `docs/frontend/conventions.md` (UX conventions: pane hiding, mode chips, queue actions)
- Change: `docs/product/core-guidelines.md` only if the mobile-first bullet still implies equal-width mode tabs or labeled queue pills on phones
- Do not change: `AGENTS.md`, `docs/README.md`

### Steps

1. In the UX conventions list, state: mobile hides the inactive pane with `.hidden` on the `.view` root (`#view-library` / `#view-playlist`). `LibraryView` must remain a single root so `App.vue` fallthrough works. Desktop (`min-width: 900px`) still forces `.view.hidden` visible and hides `#tab-bar`.
2. Mode chips: one row, labeled, horizontal scroll, no wrap; selected id is `useLibraryLocation()` (last library on `/queue`), not raw `route.meta.mode`. Helper: `effectiveLibraryMode` in `browseMode.ts`.
3. Queue view-bar: icon-only actions below 900px; labeled pills at/above. Sprite stays in `frontend/index.html`.
4. Do not leave this plan as the source of truth for those rules.

### Verify

```sh
rg -n "useLibraryLocation|effectiveLibraryMode|single root|#view-library|mode-bar" docs/frontend/conventions.md docs/product/core-guidelines.md
```

## Acceptance

- [ ] Conventions say `.hidden` must sit on `.view`, and `LibraryView` is a single root.
- [ ] Conventions say mode chips scroll instead of wrapping or shrinking labels, and selection follows library location.
- [ ] Conventions say queue actions are icon-only below 900px.
- [ ] No new top-level doc page. No API tables.
