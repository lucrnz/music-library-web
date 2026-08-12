# Stage 03: catalog.js + thin downloads index

## Status
done

## Description

Complete the downloads package target map with hard cutover.

**Merge into `catalog.js` (delete sources in the same stage):**

- `records.js`
- `status.js` (`catalogIndex`, join / UI status)
- `art.js`
- `codec.js`

**Leave as separate modules:** `opfs.js`, `resolve.js`, `browse.js`, `hierarchy.js`, `storageInfo.js`, `state.js`, `db.js`, `lyricsStore.js`, `ui.js`, `worker.js`, `queue.js` (stage 02), `queuePolicy.js`.

### Public import matrix (normative)

| Concern | Module | Notes |
|--------|--------|--------|
| Lifecycle: init / enable / disable / boot | `index.js` | Only entry for feature power on/off |
| Enqueue (no UI confirm) | `index.js` → `enqueueTrack(s)` | Calls into `queue.js` |
| User download (confirm) | `ui.js` | Only `downloadTrack(s)` for components |
| Remove downloaded track/album/artist; wipe when disabled | `index.js` | Actions |
| Pause / resume all | `index.js` | Thin wrappers over policy/queue |
| **Cancel / retry / clear finished** | **`index.js` thin wrappers** | Call `queue.js`; modal may keep importing from index — **not** a blanket re-export of queue internals |
| Manager open/close, orphan check, near-quota probe, storage line helpers that read `downloads` state | `index.js` | Actions / façade |
| Network constraint notify | `index.js` `onNetworkConstraintChanged` | Keep |
| Reactive `downloads` fields | `state.js` | Direct import |
| `catalogIndex`, `trackDownloadState`, record CRUD used outside index | `catalog.js` | Direct import (e.g. DownloadIcon, playlist prepare) |
| `resolvePlaySource`, `resolveCoverUrl` | `resolve.js` | Direct import |
| `formatBytes` and pure storage formatters | `storageInfo.js` | Direct import — **not** re-exported from index |
| `buildDownloadsHierarchy` | `hierarchy.js` | Direct import — **not** re-exported from index |
| Connectivity notes | `stores/connectivity.js` | Never via downloads |

**Forbidden on `index.js` after this stage:** re-export of resolve, catalog projection/status, hierarchy, pure storage formatters, connectivity, or raw queue store/progress/runtime symbols.

**Do not absorb** `queuePolicy.js` or `worker.js` into `queue.js` / `catalog.js` (keeps merged sizes well under 1k; projected queue ~661, catalog ~623).

### Docs

Update `docs/frontend/conventions.md` (downloads import rules) to match this matrix so the barrel does not grow back.

## Rationale

Records, projection, art, and codec helpers are one offline-catalog concern. An **explicit** public matrix is the thin-index design — without it, “actions only” silently becomes a god barrel again. Thin wrappers for cancel/retry/clearFinished keep the manager’s import path stable without exporting queue guts.

## Implementation

1. Merge into `catalog.js`; keep reactive `catalogIndex` and single-writer rules (hydrate + record writes; existing `syncCatalogProjection` call sites move with records).
2. Rewrite `index.js` to the matrix: lifecycle + listed actions + thin queue manager wrappers only.
3. Update every importer: `DownloadIcon` → `catalog.js` for `trackDownloadState`; `DownloadsModal` → `storageInfo.js` for `formatBytes`, keep cancel/retry via index; tree `downloadsSource` → `hierarchy.js`; player/playlist → `resolve.js` / `catalog.js` as needed.
4. Delete `records.js`, `status.js`, `art.js`, `codec.js`.
5. Patch frontend conventions doc.
6. Smoke: download → ready icon; offline local play; wipe; orphan; local-first covers; manager cancel/retry/clear finished.
