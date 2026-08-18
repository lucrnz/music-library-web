# Stage 06: Living docs

## Status
done

## Description

Write the selection policy and overflow-copy rules into `docs/frontend/conventions.md` (and a one-line product note if needed). This plan directory is not living documentation.

## Rationale

Later agents will otherwise re-open “should titles be selectable?” and “where does photo still appear?” by reading this plan instead of the project docs.

## Invariants

- Do not copy request/response shapes or CSS property lists into docs. Point at `frontend/css/app.css`, `clipboard.ts`, and the `*MenuItems.ts` builders.
- Prefer editing `docs/frontend/conventions.md` over a new system page.
- Do not treat `context/design.md` as durable.

## Risks

- The existing artist-photo paragraph in conventions is easy to leave stale (grid is no longer desktop-right-click-only; artist header now has the photo menu). Update that paragraph in place.

## Implementation

### Files

- Change: `docs/frontend/conventions.md` (selection policy, `copyText`, `⋯` surfaces, photo gate, no long-press, `⋯` is the action home, lyrics copy rules)
- Change: `docs/product/core-guidelines.md` — one Experience sentence: chrome is not a document; copy names/lyrics via `⋯`, not selection
- Do not change: `docs/README.md`

### Steps

1. UX conventions: app-wide `user-select: none` with opt-in for form controls and `.lyrics-plain`. Shared `copyText` (“Copied” / “Could not copy”).
2. Replace the artist-photo **surfaces** bullets: list/grid/tree **and artist-page header** have photo; grid now has visible `⋯` plus desktop right-click; search, downloads, queue, now-playing still do not get a photo menu.
3. Document entity `⋯` (list, grid, tree, artist/album headers, expanded now-playing), folded `+` / tree plus / chevron, DownloadIcon and page pills staying, desktop contextmenu, no long-press, no native browser menu on those rows.
4. Lyrics: plain selectable + copy; synced not selectable, copy flattens via `parseLrc` (no timestamps, drop `♪`, collapse consecutive dupes). Visibility is memory peek only (`peekLyricsMemory`); do not document `allowNetwork: false` as a peek.
5. Point at builders as the source of item order. Note injected `run`s and `downloads/addAll.ts` so downloads menus stay catalog-local.
6. Grid `⋯` is visible (no longer desktop-right-click-only). `showMenu` and `includePhoto` are separate; `includePhoto` is photo items **and** drop-to-crop.

### Verify

```sh
# docs only — no test command required
```

Read the conventions section and confirm it matches shipped chrome, not the pre-plan artist-grid rule.

## Acceptance

- [ ] `docs/frontend/conventions.md` states selection opt-ins, copy helper, every `⋯` surface, photo gate (including artist header and grid `⋯`), and lyrics copy.
- [ ] This plan is not cited as the source of truth.
