# Stage 03: Split catalog.ts

## Status
done

## Description

Move catalog projection, art, and writer into three modules. Leave `catalog.ts` as a re-export barrel so existing `@/downloads/catalog` imports keep working.

## Rationale

`catalog.ts` is 792 lines and three concerns. Splitting on the comments already in the file is what stops the next catalog feature from crossing ~1k.

## Invariants

- Public names exported from `@/downloads/catalog` stay the same (barrel).
- `withCatalogLock` still serializes commit and delete. Finalize is still one IDB txn (tracks / albums / artists / queue). Art network I/O still runs after that txn.
- Delete is still IDB (and projection) first, then OPFS unlink.
- Art-url keys stay `artist:` / `cover:` and browse `a:` / `al:`. Do not migrate keys.

## Risks

- Moving `withCatalogLock` without moving every writer onto it re-opens the double-pin race.
- Circular imports if `writer.ts` imports projection and projection imports writer. Projection must not import writer.

## Implementation

### Files

- `frontend/src/downloads/catalog.ts`
- `frontend/src/downloads/projection.ts`
- `frontend/src/downloads/art.ts`
- `frontend/src/downloads/writer.ts`
- `frontend/src/downloads/`
- `frontend/tests/downloads/actionKind.test.ts`

### Steps

1. Create `frontend/src/downloads/projection.ts` with the projection/status block from `catalog.ts`: `catalogIndex`, `catalogUiStatus`, `joinDownloadUiStatus`, `trackDownloadState`, `isLocallyPlayableDownload`, `setCatalogProjectionMap`, `syncCatalogProjection`, `clearCatalogProjection`, and the projection types (`CatalogProjectionEntry`, `CatalogUiStatus`, `DownloadUiStatus`, `QUEUE_UI_STATES`).
2. Create `frontend/src/downloads/art.ts` with the art-cache block: `artUrlCache`, `revokeArtCached`, `wipeArtUrlCache`, `refreshArtistArtFile`, `getLocalCoverUrl`, `getLocalArtistImageUrl`, `ensureAlbumArtFiles`, `ensureArtistArtFile`. Art may import record reads from `writer.ts` (`getOne` wrappers) or take them as already exported list/get helpers moved in step 3 — do not duplicate IDB reads.
3. Create `frontend/src/downloads/writer.ts` with `withCatalogLock`, record types used for IDB (`CatalogAlbumRecord`, `CatalogArtistRecord`, `CatalogTrackAudioMeta`), `getTrackRecord` / `listTrackRecords` / `listAlbumRecords` / `listArtistRecords`, `getLocalAudioUrlForRecord`, `markTrackBroken` / `markTrackOrphan`, `commitTrackDownload` / `finalizeTrackDownload`, `deleteTrackDownload` / `deleteAlbumDownloads` / `deleteArtistDownloads`, `wipeAllDownloads`, `sumDownloadedBytes`. Writer calls `syncCatalogProjection` from projection and art cleanup from `art.ts`.
4. Replace the body of `frontend/src/downloads/catalog.ts` with re-exports of every name those three modules export (same names as today). Do not change other production import specifiers.
5. `frontend/tests/downloads/actionKind.test.ts` may keep importing `catalogIndex` from `@/downloads/catalog`. If a test needs a writer/projection symbol, still import the barrel.

### Verify

- `pnpm --dir frontend test -- frontend/tests/downloads/`
- `pnpm --dir frontend typecheck`
- `wc -l frontend/src/downloads/catalog.ts frontend/src/downloads/projection.ts frontend/src/downloads/art.ts frontend/src/downloads/writer.ts` — `catalog.ts` is a short barrel; each split file is smaller than 792
- Existing `@/downloads/catalog` imports still typecheck (no mass import rewrite)

## Acceptance

- Projection, art, and writer live in the three new files. `catalog.ts` only re-exports.
- Commit/delete still use `withCatalogLock`. Finalize is still one txn. Art I/O is still after the txn.
- No production import path besides the barrel is required. No art-key migration.
