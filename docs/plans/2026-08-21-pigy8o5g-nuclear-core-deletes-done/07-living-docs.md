# Stage 07: Living docs

## Status
done

## Description

Update living docs so the shipped owners match stages 01–06. Do not treat `context/design.md` as documentation.

## Rationale

Ownership changes that outlive this plan belong in the project docs the next agent will read.

## Invariants

- Docs describe intent and owners, not a second copy of `stream_intent` cases or encoder argv.
- `context/design.md` is not linked as a source of truth.

## Risks

None

## Implementation

### Files

- `docs/frontend/conventions.md`
- `docs/systems/playback.md`
- `docs/systems/downloads.md`
- `docs/systems/transcoding.md`
- `docs/systems/library-scan.md`
- `docs/development/project-structure.md`

### Steps

1. `docs/frontend/conventions.md`: `resolvePlaySource` returns `PlayIntent`. Fail path is `failCurrentLoad`. Catalog public import remains `@/downloads/catalog` (barrel over `projection.ts` / `art.ts` / `writer.ts`). Prepare bookkeeping lives in `playback/prepare.ts`, not `api.ts`.
2. `docs/systems/playback.md`: same play-decision and `failCurrentLoad` owners. `preparedKeys` / `requestPrepare` / `requestForget` are in `playback/prepare.ts`.
3. `docs/systems/downloads.md`: replace the single `catalog.ts` owner line with projection / art / writer + barrel.
4. `docs/systems/transcoding.md`: prepare HTTP validates unknown tags via `get_profile` (400). `SOURCE_TAG` is not a dummy `stream_intent(is_lossy=False)` probe; enqueue still skips non-encode.
5. `docs/systems/library-scan.md`: album lossy-kind owner is `finalize.recount_entities` SQL. Delete the `lossy_kind.py` pointer.
6. `docs/development/project-structure.md`: drop `artist_image.py` as a store. Scanned portraits are `WebpAssetStore` under `covers/artists/`. HTTP: `routes/media.py` (stream/cover) and `routes/artist_images.py` (preferred + scanned GET).

### Verify

- `rg -n "artist_image\\.py|lossy_kind\\.py|PlaySource|ArtistImageStore|stream_intent\\(is_lossy=False" docs/frontend docs/systems docs/development docs/architecture` is empty (ignore `docs/plans/`)
- `rg -n "projection\\.ts|artist_images\\.py|format_iso_utc|failCurrentLoad" docs/frontend/conventions.md docs/systems/playback.md docs/systems/downloads.md docs/development/project-structure.md` matches the new owners

## Acceptance

- Living docs name the shipped modules. No leftover pointers to `artist_image.py`, `lossy_kind.py`, `PlaySource`, or prepare bookkeeping in `api.ts`.
- Plan `context/design.md` is not cited as living documentation.
