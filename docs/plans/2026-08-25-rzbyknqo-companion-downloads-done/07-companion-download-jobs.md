# Stage 07: Companion download jobs

## Status
done

## Description

On `canUseCompanionDownloads()`, the queue worker, art writer, and delete path use the companion blob API instead of OPFS. Catalog used stays IDB. Storage line adds real free. Companion disconnect auto-pauses the queue.

## Rationale

This is the backend flip. Play and migrate are useless until jobs land files in the sidecar.

## Invariants

- Companion backend never calls `writeResponseToFile` / OPFS unlink for locker audio or art.
- IDB finalize order unchanged: catalog + refcounts + queue delete, then art, delete IDB first then blob unlink.
- `downloadedBytes` still uses stage 01 catalog rules. Companion `disk_info_ok.free` is the only free number shown.
- `AutoPausedReason` includes `"companion"`. Pump `canPump` is false while that reason is set.
- Any authenticated session may `blob_put` / delete (already true in stage 05).
- Disk full (`blob_error` `enospc` or `QuotaExceededError`) fails the job; no pre-check dialog.

## Risks

- Worker tests are forbidden. Keep a thin `downloads/companionBlob.ts` that maps WS events so queuePolicy tests can mock it.
- `requireOpfs()` on desktop PWA boot must not run once this backend is live.

## Implementation

### Files

- `frontend/src/downloads/companionBlob.ts`
- `frontend/src/downloads/worker.ts`
- `frontend/src/downloads/art.ts`
- `frontend/src/downloads/writer.ts`
- `frontend/src/downloads/index.ts`
- `frontend/src/downloads/state.ts`
- `frontend/src/downloads/storageInfo.ts`
- `frontend/src/downloads/queuePolicy.ts`
- `frontend/src/exclusive/companionClient.ts`
- `frontend/tests/downloads/queuePolicy.test.ts`
- `frontend/tests/downloads/storageInfo.test.ts`

### Steps

1. Create `frontend/src/downloads/companionBlob.ts`: `fileUrl(key)`, `putFromUrl({ requestId, key, url, offset })`, `abort`, `deleteKey`, `stat`, `diskFree`, `putBytes` (HTTP PUT for migrate later — export now). Talk to `frontend/src/exclusive/companionClient.ts` send + `onCompanionEvent`. Build `http://127.0.0.1:{port}/files/{key}?token=`.
2. In `frontend/src/exclusive/companionClient.ts`, export a `sendCompanion(msg)` already used internally, and forward blob_* events through `onCompanionEvent`.
3. In `frontend/src/downloads/worker.ts`, when `canUseCompanionDownloads()`, `executeDownloadJob` stats the partial/final key, `blob_put`s the same `streamUrl` it uses today, maps `blob_progress` to `updateLiveProgress`, and on `blob_done` calls `finalizeTrackDownload` with those bytes. Abort → `blob_abort`. `enospc` → failed. No OPFS writes on this path.
4. In `frontend/src/downloads/art.ts`, companion backend: `blob_put` (or HTTP GET via companion) for cover/artist URLs into art keys; set `thumbBytes` / `fullBytes` from `blob_done`. Skip OPFS `writeFromResponse`.
5. In `frontend/src/downloads/writer.ts` delete/wipe: after IDB, `deleteKey` each audio/art key when companion backend; keep OPFS unlink on the OPFS backend. `sumDownloadedBytes` on companion backend uses record bytes only (no OPFS walk).
6. In `frontend/src/downloads/index.ts` `bootDownloadsRuntime` / `enableDownloads`: if companion backend, skip `requireOpfs()`; still `openDownloadsDb`. `refreshStorageInfo` requests `diskFree` and stores it.
7. In `frontend/src/downloads/state.ts`, add `storageFree: number` (0 when unknown / OPFS). Extend `AutoPausedReason` with `"companion"`.
8. In `frontend/src/downloads/storageInfo.ts`, when `storageFree > 0` (companion live), format `N tracks · used · ${formatBytes(free)} free`. OPFS stays `N tracks · used`. Extend `frontend/tests/downloads/storageInfo.test.ts`.
9. In `frontend/src/downloads/queuePolicy.ts`, treat companion disconnected (while companion backend + enabled) as auto-pause `"companion"` with a banner like the server-down one. `canPump` false. On reconnect, same resume path as server recovery. Extend `frontend/tests/downloads/queuePolicy.test.ts`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/downloads/queuePolicy.test.ts frontend/tests/downloads/storageInfo.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- OPFS `sumExistingFileSizes` is not used when `canUseCompanionDownloads()` is true.
- Storage line on companion is `N tracks · used · X free` when `storageFree > 0`.
- Queue policy tests: companion-down while capable+enabled freezes; reconnect clears the reason when connectivity is otherwise fine.
- Worker companion path is not covered by vitest (forbidden). Typecheck passes.
