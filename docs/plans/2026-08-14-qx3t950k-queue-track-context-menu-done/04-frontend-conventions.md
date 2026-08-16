# Stage 04: Frontend conventions

## Status
done

## Description

Write the durable rules into living docs: presentational menu chrome (no store), the 900px helper, close-before-confirm, and queue ⋮ + `contextmenu`.

## Rationale

`context/design.md` is not living documentation. The next person who adds a track menu on library rows needs the convention page, not this plan.

## Invariants

- Docs stay at intent / ownership / guardrails. No copy of item ids, download state tables, or route names.
- `docs/plans/` is not linked as a source of truth.

## Risks

- Documenting a store that was deliberately not built. The convention is **component + local state**, extract a store only when a second caller needs one.
- Over-specifying labels so the doc rots. Keep it to ownership and guardrails.

## Implementation

### Files

- Change `docs/frontend/conventions.md`
- Change `docs/development/project-structure.md` (one ownership line for `components/menu/` and `layout.js`)

### Steps

1. In **Architecture** (conventions): row action menus live under `components/menu/` (`ActionCard`, `AnchoredMenu`, thin `ActionMenu` picker). Callers own open/anchor state and pass items with `run()`. Do not add `stores/actionMenu.js`. Do not add an `actions` mode to `dialog.js`. A second surface mounts its own picker; do not invent a second overlay system.
2. In **UX conventions**:
   - Action-menu chrome follows `(min-width: 900px)` via `layout.js` (`DESKTOP_MEDIA`, `useDesktopViewport()`). Centered card below, anchored dropdown at/above. Same breakpoint as the dual-pane shell. New code does not copy the query string.
   - Close the menu before `confirmDialog` / `promptDialog` (picker closes, then `run()`).
   - Modal lock: the **card** is a token holder (`"action-menu"`). The desktop dropdown is not.
   - Queue rows: overflow button + desktop `contextmenu`; no native browser menu; no long-press unless product revisits it. Caller closes on route change and when Edit is entered; the picker does not import the router.
   - Interactive downloads: `confirmRemoveDownloadedTrack` lives next to `downloadTrack` in `downloads/ui.js`. Download **kind** join returns `{ kind }` only; icon titles, glyphs, disabled, and menu labels stay with their callers.
3. In project-structure: `static/js/components/menu/` owns action-menu chrome; `static/js/layout.js` owns the desktop media query for new JS. Point at `docs/frontend/conventions.md`.
4. Do not add a systems page. Do not add a technical-decision entry. Do not list the four queue actions.

### Verify

- Read the two doc pages against [design.md](./context/design.md) settled **structure** decisions: component primitive, no store, `layout.js` + `useDesktopViewport()`, parent route-close, kind-only download join, close-then-run, card-only modal lock, queue gestures.
- `uv run --group dev pytest` (no code change expected; still run).

## Acceptance

- [ ] `conventions.md` names the component primitive (not a store), `layout.js` / `useDesktopViewport()`, parent route-close and Edit-close, close-before-confirm, card modal-lock, `{ kind }`-only download join, and queue open gestures.
- [ ] `project-structure.md` names `components/menu/` and `layout.js`.
- [ ] No duplicated download-state or item-order tables.
- [ ] Plan directory is not cited as the source of truth.
