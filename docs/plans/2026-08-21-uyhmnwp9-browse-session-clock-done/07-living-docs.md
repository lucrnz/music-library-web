# Stage 07: Living docs

## Status
done

## Description

Update the living systems and frontend docs so they name shipped ownership: `BrowseSource` / `entityActionsFor`, `loadResolved` + companion gate, `become`, `setOutputVolume`, radio chrome without stored `preview`, `last_scan_finished_at`, and `_step`.

## Rationale

`design.md` is not living documentation. The last stage of every plan in this repo patches the pages operators and agents actually read.

## Invariants

- Do not copy API shapes, table columns, or encoder argv into docs.
- `docs/plans/` is not updated except this stage file’s status when the implementer marks it done.

## Risks

None

## Implementation

### Files

- `docs/frontend/conventions.md`
- `docs/systems/playback.md`
- `docs/systems/radio.md`
- `docs/systems/library-scan.md`
- `docs/development/project-structure.md`

### Steps

1. `conventions.md`: library browse is `BrowseSource` + `entityActionsFor` consumed by `LibraryView` and `LibraryTreePane`. Downloads tree kinds are `artist` / `album` / `track` (no `dl-*`). Player load is `loadResolved`; exclusive gate is `companionSink.load`. Handoff is `become("none" | "queue" | "radio")` in `onDemandControl.ts`. Volume is `setOutputVolume` in `playerPrefs.ts`; radio watches `player.volume`. Delete `claimOnDemand` / `teardown.ts` names. `needsCompanionStop` lives next to `PlayIntent`.
2. `playback.md`: same handoff/load/gate/volume names. Radio section: chrome is `inactive | stopped | tuning | tuned`; tab-open-without-tune-in is `inactive` + `tabOpen`; `radioGen`; face handler is the only `loadCurrent` driver.
3. `radio.md`: replace `claimOnDemand` with `become("queue")`. Socket rule still tab or `stopped|tuning|tuned`. Catalog rebuild is `last_scan_finished_at`, not `scan_state.kind`. Client chrome list drops `preview`.
4. `library-scan.md`: job runner has one `_begin`; `_progress` logs; a completed scan writes `last_scan_finished_at` for radio. Do not document the new column as a schema dump — point at `ScanState` / `radio_repo.scan_finished_at`.
5. `project-structure.md`: browse ownership sentence if it still says prefixed source functions; jobs line notes `_begin` + scan watermark for radio.

### Verify

- `rg -n "claimOnDemand|dl-artist|preview" docs/frontend/conventions.md docs/systems/playback.md docs/systems/radio.md` is empty (except any explicit “preview is not stored chrome” sentence).
- `rg -n "kind != .scan.|scan_state.finished_at" docs/systems/radio.md docs/systems/library-scan.md` is empty.

## Acceptance

- Living docs match shipped names from stages 01–06.
- No new ADR. `context/design.md` stays an archive of this plan’s decisions.
