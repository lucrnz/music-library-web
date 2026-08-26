# Stage 02: Format album meta

## Status
done

## Description

Map the new album duration fields on the client and add the one formatter both trees, cards, list rows, and chrome will call.

## Rationale

Pluralization, omit-missing, and `formatTime` must live in one function. If each surface joins strings, `1 tracks` and `0:00` will come back.

## Invariants

- `formatAlbumMeta` never calls `formatTime` with null/NaN/negative. Unknown length is an omitted segment, not `0:00`.
- `formatTrackCount(1)` is `1 track`; every other finite integer is `N tracks`.
- Segments: optional artist, year if truthy, track count if `trackCount` is a finite number (including 0), duration if a finite non-negative number was passed.
- Join with ` · `. Empty input → `""`.
- `fromApiAlbum` accepts snake_case and camelCase for `duration` / `duration_ms`, same pattern as `trackCount`.

## Risks

- Feeding `formatTime` a null album duration would print `0:00` and violate the omit rule. Tests must lock the skip.

## Implementation

### Files

- `frontend/src/models/album.ts`
- `frontend/src/components/library/loaders.ts`
- `frontend/src/util.ts`
- `frontend/tests/models/album.test.ts`
- `frontend/tests/util.test.ts`

### Steps

1. In `frontend/src/models/album.ts`, add `duration: number | null` (seconds) and `durationMs: number | null` to `Album`. In `fromApiAlbum`, convert `duration` / `duration_ms` / `durationMs` the same way `fromApiTrack` does (either field may arrive; derive the other).
2. In `frontend/src/components/library/loaders.ts`, extend `LibraryAlbum` with optional `duration` and `durationMs`.
3. In `frontend/src/util.ts`, add `formatTrackCount` and `formatAlbumMeta({ artist?, year?, trackCount?, durationSec? })` as specified in Invariants. Do not change `formatTime` itself.
4. Update `frontend/tests/models/album.test.ts` to assert `duration` / `durationMs` from `duration_ms` and from `duration`.
5. Create `frontend/tests/util.test.ts`: `1 track` / `12 tracks` / `0 tracks`; full `Artist · 1996 · 11 tracks · 48:32`; omitted year; omitted duration (null does not become `0:00`); artists-tree shape with no artist; empty → `""`; `70+` minutes stays `m:ss` via `formatTime`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/models/album.test.ts frontend/tests/util.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- `fromApiAlbum({ id: "a", duration_ms: 2912000 })` yields `durationMs === 2912000` and `duration === 2912`.
- `formatAlbumMeta({ year: 1996, trackCount: 11, durationSec: 2912 })` is `1996 · 11 tracks · 48:32`.
- `formatAlbumMeta({ year: 1996, trackCount: 11, durationSec: null })` is `1996 · 11 tracks`.
- `pnpm --dir frontend test -- frontend/tests/models/album.test.ts frontend/tests/util.test.ts` and `pnpm --dir frontend typecheck` pass.
