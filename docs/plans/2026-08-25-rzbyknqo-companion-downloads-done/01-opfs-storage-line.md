# Stage 01: OPFS catalog used line

## Status
done

## Description

Replace the estimate() used/quota/free storage line with `N tracks · catalog-used`. Catalog used is ready-track audio plus flagged album/artist art. Remove near-quota confirms and banners. Do not change `persist()` or the companion.

## Rationale

The 2 GiB quota line is a lie on first-party Chrome PWAs. This stage ships the honest OPFS face without waiting for the sidecar.

## Invariants

- One formatter, three surfaces: Settings short, manager long, leftover-when-disabled. No short/long split.
- N = `listTrackRecords().length` (ready + broken + orphan).
- Size = sum of `bytes` on rows with `status === "ready"` plus art files those album/artist records own (`hasThumb` / `hasFull`).
- Per-track manager leaves stay `leafBytes` (audio).
- `getNearQuotaWarning` always `{ near: false }`. No confirm in `ui.ts`. No `nearQuota` banners.
- `refreshStorageInfo` must not assign `storageQuota` for display. `persist()` still runs on downloads boot.

## Risks

- Walking OPFS art on every refresh can hitch a large locker. Walk only flagged files; skip missing handles.
- Old album/artist rows have flags but no stored sizes — walk `file.size` (or persist `thumbBytes` / `fullBytes` when art is written and prefer those).

## Implementation

### Files

- `frontend/src/downloads/storageInfo.ts`
- `frontend/src/downloads/writer.ts`
- `frontend/src/downloads/art.ts`
- `frontend/src/downloads/opfs.ts`
- `frontend/src/downloads/index.ts`
- `frontend/src/downloads/ui.ts`
- `frontend/src/components/settings/SettingsModal.vue`
- `frontend/src/components/downloads/DownloadsModal.vue`
- `frontend/tests/downloads/storageInfo.test.ts`

### Steps

1. In `frontend/src/downloads/storageInfo.ts`, change `formatDownloadsStorageLine` to ignore `storageUsage` / `storageQuota`. If `trackCount` is 0, return the existing empty copy (`"No downloads yet"` / short `"Ready — no downloads yet"`). Else return `` `${n} tracks · ${formatBytes(used)}` `` with `used = downloadedBytes`. Collapse short/long to the same string. Keep `formatIdleDownloadsSummary` on that same shape (it already is). Leave `getStorageEstimate` / `isNearQuota` in the file but unused by the formatter.
2. In `frontend/src/downloads/writer.ts`, change `sumDownloadedBytes` to sum `t.bytes` only when `t.status === "ready"`, then add art bytes. Export a pure `artFileSpecsFromRecords(albums, artists)` that, for each `hasThumb` / `hasFull`, yields the dir-parts + filename already defined in `frontend/src/downloads/opfs.ts` (`albumCoverDirParts`, `albumCoverFileName`, `artistCoverDirParts`, `artistCoverFileName`).
3. In `frontend/src/downloads/opfs.ts`, add `sumExistingFileSizes(specs)` that `getFile().size`s each spec and ignores missing files. `sumDownloadedBytes` awaits that. When `frontend/src/downloads/art.ts` writes a thumb/full, store `thumbBytes` / `fullBytes` on the album/artist record if the writer already has the row open; `sumDownloadedBytes` prefers those fields and only walks when a flag is true and the field is missing.
4. In `frontend/src/downloads/index.ts` `refreshStorageInfo`, keep assigning `downloadedBytes` / `trackCount` from the new sum and row count. Stop driving UI from `est.quota`: set `downloads.nearQuota = false` always; `storageQuota` may stay 0. Remove the useful path from `getNearQuotaWarning` (always `{ near: false }`) or delete the helper and its import in `frontend/src/downloads/ui.ts`.
5. In `frontend/src/downloads/ui.ts`, delete `confirmNearQuotaIfNeeded` and call `enqueueTrack` / `enqueueTracks` directly.
6. In `frontend/src/components/settings/SettingsModal.vue` and `frontend/src/components/downloads/DownloadsModal.vue`, remove the `downloads.nearQuota` warn paragraphs. Settings already uses `formatDlStorage("short")` — both styles now match.
7. Add `frontend/tests/downloads/storageInfo.test.ts`: empty copy; `3 tracks · 1.5 GB` (pick bytes that `formatBytes` prints stably); short === long; `artFileSpecsFromRecords` emits thumb+full for one album and thumb for one artist, nothing for empty flags.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/downloads/storageInfo.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- With 2 ready tracks (100 + 200 bytes) and no art, the Settings and manager lines are `2 tracks · 300 B` (or the existing `formatBytes` rendering of 300).
- A broken/orphan row increments N and does not add its `bytes`.
- Download / Download all never opens “Storage almost full.”
- Settings and manager have no “Storage almost full” hint.
- `persist()` is still called from `bootDownloadsRuntime`.
