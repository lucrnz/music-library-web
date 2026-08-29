# Stage 07: Living docs

## Status
done

## Description

Update durable docs to the identity, chrome, watch, and reader contracts this plan shipped. Do not treat this plan directory as the spec after merge.

## Rationale

`docs/systems/cd-playback.md` still describes hidden `cd-discid` rows and the playlist pane as the disc list. Operators and later agents will copy that.

## Invariants

- Do not copy TOC JSON, WAV byte maps, or encoder argv into docs.
- `context/design.md` is not living documentation.
- Prefer updating existing pages. No new systems page.

## Risks

None

## Implementation

### Files

- `docs/systems/cd-playback.md`
- `docs/systems/companion.md`
- `docs/systems/exclusive-audio.md`
- `docs/systems/playback.md`
- `docs/systems/playback-stats.md`
- `docs/systems/library-scan.md`
- `docs/database/overview.md`
- `docs/frontend/conventions.md`
- `docs/development/project-structure.md`
- `docs/README.md`
- `AGENTS.md`

### Steps

1. `docs/systems/cd-playback.md`: unripped stubs + snapshot; identify returns `applied`; GET is local; half-bind; merge on rip; dedicated `CdTrackList`; watch ≠ `release_device`; one reader per track; hog = exclusive on; store split. Remove “playlist pane is a view” and “hidden `cd-discid` forever”.
2. `docs/systems/companion.md`: watch lifetime; `release_device` unhogs only; optical session module; persistent reader.
3. `docs/systems/exclusive-audio.md`: exclusive-off CD still watches; mid-play reload unchanged.
4. `docs/systems/playback.md` / `docs/frontend/conventions.md`: CD list is not `PlaylistView`; `queueActionsAllowed`; `cd/identifyFlow.ts` + `cd/runtime.ts`.
5. `docs/systems/playback-stats.md`: listens on bound or unripped ids; rankings include those tracks; no chip.
6. `docs/systems/library-scan.md`: merge into unripped holes; `count_missing` excludes unripped; no algo filter.
7. `docs/database/overview.md`: `cd_identities` snapshot + `tracks.unripped`. Not a type-tag in FTS/scan.
8. `docs/development/project-structure.md`: `optical_session.py`, `CdTrackList.vue`, `cd/identifyFlow.ts`.
9. `docs/README.md` / `AGENTS.md`: keep the existing CD deep-dive pointer; no plan-directory link as spec.

### Verify

Read each edited page’s CD paragraph. Confirm no plan-directory link is presented as the living spec. Confirm `cd-playback.md` states watch ≠ hog and identify-returns-applied.

## Acceptance

- A new agent can find unripped vs browse, half-bind, merge, snapshot identify, `CdTrackList`, and watch lifetime from `docs/systems/cd-playback.md` without opening this plan.
- Scan / stats / companion / playback pages match those contracts.
- No TOC/WAV byte tables copied into docs.
