# Stage 02: catalog camel-only

## Status
done

## Description

`CatalogTrackRecord` is the camel document `buildCatalogRecord` already writes. Drop the snake tech aliases from the type. Old IDB rows still coerce through `fromCatalogRecord` / `fromApiTrack` `pick()`.

## Rationale

The type currently advertises a dialect the writer does not persist. That is the opposite of a boundary. Closing it now means stage 03 does not keep threading `is_lossy` through downloads tree fixtures.

## Invariants

- `buildCatalogRecord` write shape is unchanged (`trackId`, `trackNum`, camel tech fields).
- No IndexedDB version bump and no rewrite of stored rows.
- `fromCatalogRecord` still accepts a loose record so a snake-shaped legacy row becomes a `Track`.

## Risks

- A test fixture typed as `CatalogTrackRecord` that only set `is_lossy` will fail the typecheck. Fix the fixture to camel; do not put snake back on the type.

## Implementation

### Files

- frontend/src/models/track.ts
- frontend/tests/models/track.test.ts

### Steps

1. In `frontend/src/models/track.ts`, delete `is_lossy`, `source_codec`, `bitrate_kbps`, `sample_rate_hz`, and `bitrate_mode` from `CatalogTrackRecord`. Leave the camel tech fields.
2. Keep `fromCatalogRecord` passing a loose object into `fromApiTrack` (or equivalent `pick`) so a stored row with only snake tech fields still maps. Do not add those keys back onto the interface.
3. In `frontend/tests/models/track.test.ts`, add a `fromCatalogRecord` case whose input is an untyped / `Record` snake-shaped row (`is_lossy`, `source_codec`, …) and assert camel `Track` fields. Existing camel round-trip stays.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test tests/models/track.test.ts tests/downloads/hierarchy.test.ts tests/downloads/addAll.test.ts tests/tree/downloadsMenuMap.test.ts`

## Acceptance

- `CatalogTrackRecord` in `frontend/src/models/track.ts` has no `is_lossy` / `source_codec` / `bitrate_kbps` / `sample_rate_hz` / `bitrate_mode` properties.
- `fromCatalogRecord` on a snake-shaped loose row still yields `isLossy` / `sourceCodec` / `bitrateKbps` / `sampleRateHz` / `bitrateMode`.
- `pnpm --dir frontend typecheck` exits 0. The Verify test list exits 0.
