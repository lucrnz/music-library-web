# Stage 05: Living docs

## Status
done

## Description

Point living ownership docs at the files and contracts stages 01–04 created, and delete sentences that describe the old forks.

## Rationale

Source-of-truth lines in conventions, playback, downloads, scan, and project-structure would still name `loadResolved` on `player.ts`, stats chrome beside load, `queue.ts` abort, and runner-owned walk. Those lines outlive the plan directory.

## Invariants

- Docs describe ownership and file locations, not request shapes or encoder argv.
- Do not add a new ADR. Do not treat `context/design.md` as living documentation.

## Risks

- None

## Implementation

### Files

- docs/frontend/conventions.md
- docs/systems/playback.md
- docs/systems/playback-stats.md
- docs/systems/downloads.md
- docs/systems/library-scan.md
- docs/development/project-structure.md

### Steps

1. In `docs/frontend/conventions.md`, say load/fail lives in `playback/load.ts` (`failCurrentLoad` is the only fail writer; `PlayBlockError` is the sink/load failure type). `player.ts` owns transport and sink wiring. Replace “Stats chrome is applied beside load — `LibraryView.load()` is never invoked for `/stats`” with: Stats is a template body inside mounted `LibraryView`; `load()` is not called; there is no stats chrome mutation. BrowseSource owns `flags`, `chrome(input)`, and `cover()`; hosts do not switch on mode for those jobs. Downloads: `queue.ts` is IDB + live progress; abort of in-flight work is `queueRuntime` (`freezeActive` / `cancelItem`); no `downloads.liveProgress`.
2. In `docs/systems/playback.md`, move the `loadResolved` / `failCurrentLoad` source-of-truth line to `frontend/src/playback/load.ts`. Keep `player.ts` as on-demand transport / gen / active sink wiring.
3. In `docs/systems/playback-stats.md`, player call sites are sink time/ended in `player.ts` and cycle start after successful load in `playback/load.ts`.
4. In `docs/systems/downloads.md`, ownership table: queue CRUD / live `Map` on `queue.ts`; pump + abort on `queueRuntime.ts`; policy calls injected `freeze`, not runtime. Delete any implication that `index.ts` overlays `liveProgress`. Fix leftover `index.js` / `ui.js` / `resolve.js` / `connectivity.js` names in that page to the `.ts` modules they already are.
5. In `docs/systems/library-scan.md`, add `src/musicweb/scan/index_phase.py` (`run_index`) as the walk+batch phase. Runner source-of-truth stays orchestration (`PHASES`, `PhaseCtx`, `_begin_phase`) and must not claim it walks files.
6. In `docs/development/project-structure.md`, `scan/` row includes `index_phase.py`. Library browse sentence: source owns `flags` / `chrome` / `cover` (not `resolveCover`). Playback sentence: load/fail in `playback/load.ts`. Downloads sentence: `queueRuntime.ts` pump + abort; `queue.ts` does not import it.

### Verify

- `rg "applyStatsChrome|overlayQueue|liveProgress|_phase_index" docs/frontend docs/systems docs/development` is empty
- `rg "loadResolved" docs/frontend/conventions.md docs/systems/playback.md` names `playback/load.ts`, not `player.ts` as owner
- `rg "index_phase" docs/systems/library-scan.md docs/development/project-structure.md` hits

## Acceptance

- Every Files entry reflects the post-01–04 owners (no leftover “stats chrome beside load”, no runner walk, no queue↔runtime cycle described as current).
- Stale `.js` download/connectivity paths on `docs/systems/downloads.md` are gone.
- Verify ripgreps match the empty/hit expectations above.
