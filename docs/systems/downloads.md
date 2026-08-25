# Offline downloads

Optional client-side offline music: users can download stream-profile audio to the device and play without the server. Complements the PWA shell (shell bootstrap only — offline **audio** is this system).

## Source of truth

- Package: `frontend/src/downloads/`
  - Lifecycle / queue actions: `index.ts`
  - User download with confirm: `ui.ts`
  - Reactive fields: `state.ts` (`syncQueueSummary`)
  - Filename / MIME: `media.ts`
  - Catalog barrel: `catalog.ts` re-exports `projection.ts` (status join), `art.ts` (OPFS art + blob URLs), `writer.ts` (IDB lock, pin/refcount, commit/delete)
  - Catalog view (hierarchy + art + primed roots): `snapshot.ts` (`loadDownloadsCatalogView`, cached; `invalidateDownloadsCatalogView` from `writer.ts` mutations)
  - Queue IDB CRUD / live progress: `queue.ts`
  - Concurrent-job cap (allowed values, persist, rank-to-keep): `concurrency.ts`
  - Queue pump + abort maps: `queueRuntime.ts`
  - Download-tier prepare window + sync/forget: `prewarm.ts` (HTTP via `playback/prepare.ts`)
  - Network policy: `queuePolicy.ts`
  - Job I/O (`executeDownloadJob`, `streamUrl`): `worker.ts`
  - Companion blob client: `companionBlob.ts`
  - OPFS leftover migrate: `migrate.ts`
  - OPFS binary storage: `opfs.ts` (Android / leftover)
  - IndexedDB metadata: `db.ts` (no `blobs` store; binaries live in OPFS or the companion)
  - Play / cover resolution: `resolve.ts` (delivery only)
  - Hierarchy / storage formatters: `hierarchy.ts`, `storageInfo.ts`
  - Offline browse loader: `browse.ts` (`loadDownloadsView` → `LibraryPage`)
- Offline browse UI is `LibraryView` (`mode === "downloads"`), not a second library SFC. Source pieces: `frontend/src/components/library/sources/downloadsBrowse.ts`. Row covers: omitted/`null` `coverSrc` = remote fallback; `""` = placeholder (do not hit `/api/cover` when local art is missing).
- Settings that affect downloads: `frontend/src/stores/settings.ts` (download quality profile). Concurrent-job count is a separate client pref (`musicweb.downloadConcurrency`, default 2, allowed 1/2/4/6/8/10/12) owned next to the enable flag in the downloads package — not `settings.ts`. The picker is Settings → Downloads only (hidden while the feature is off); the download manager has no cap control.
- Connectivity signals consumed by queue policy: `frontend/src/connectivity.ts`
- Desktop companion blob store: `docs/systems/companion.md`
- Platform support: `docs/product/core-guidelines.md`
- PWA shell boundary: `docs/systems/pwa.md`
- Playback resolution: `docs/systems/playback.md`

## Purpose

Keep a **device-local catalog** of tracks the user chose to download, so playback and browsing can continue when the LAN server is unreachable. Downloads never write the server SQLite index or library tree.

## Storage split

| Concern | Where |
|---------|--------|
| Audio binaries and offline art | **OPFS** on Android (and leftover browser files). **Companion disk** on an installed desktop PWA (Mac / Windows / Linux Chromium). |
| Track/album/artist records, download queue, lyrics cache | IndexedDB — catalog of record on every backend |
| Feature enable flag and concurrent-job cap | Client preference storage (local) |

One Downloads feature. The companion is a dumb blob store; it does not own the catalog. Desktop Chrome **tabs** do not start new OPFS writes (toast: use the installed app). Enabling Downloads on a desktop PWA requires a live companion. Leftover OPFS on that PWA is migrated Yes / Later, then wiped.

Storage line: `N tracks · catalog used` (ready audio + owned art; N is every catalog row). On the companion backend, append real OS free space. There is no quota/free from `estimate()`, and no near-quota confirm.

Catalog commit/delete run under a module mutex. A finished job finalizes as one IDB transaction (catalog row + refcounts + queue delete); art I/O runs after. Delete drops IDB first, then unlinks OPFS or the companion key.

## Behavior (intent)

1. **Optional.** Downloads start disabled until the user enables them. Android enable needs OPFS. Desktop PWA enable needs the companion. A failed cold-start boot (`initDownloads`) must not persist the enable flag off — only explicit disable, or a failed explicit enable, writes it false.
2. **Enqueue.** Pure enqueue / lifecycle lives in `index.ts`. User-facing `downloadTrack(s)` live in `ui.ts` (migrate confirm when leftovers exist).
3. **Queue.** Background workers fetch the chosen **download** stream profile from the server. On OPFS they write the file themselves; on the companion they ask the sidecar to fetch and store. Catalog records track status (including broken/orphan cases). The pump admits up to the persisted concurrent-job cap (default 2). Raising the cap fills empty slots immediately unless the queue is user-paused or auto-paused. Lowering it keeps the in-flight jobs with the most bytes written and returns the extras to `pending` with OPFS partials kept so they resume when a slot opens. Pending and user-paused lossless rows also ask `POST /api/transcode/prepare` with `tier: "download"` for the first 8 in queue order so encodes can finish before the job is active; active jobs still `GET /api/stream`. Lossy / `source` rows are not prepared. User-pause still prewarms; auto-pause / offline does not. Cancel or disable-and-clear forgets unfinished ids that are not on the play queue; clear-finished does not forget. Lossy-indexed tracks always download the original file (`source`); the download quality picker applies to lossless only. Original-file extension and MIME are defined for MP3 and AAC only.
4. **Network policy.** Auto-pause when hard offline, server unreachable, or (desktop PWA) the companion socket is down. User pause is separate from auto-pause.
5. **Catalog projection.** In-memory projection of downloaded tracks feeds UI icons, prepare skip, and tree/list browse of local content. `trackDownloadState` `ready` / `other` means a playable local file — playback uses that join to gray and skip undownloaded queue rows when `connectivity.canUseRemote` is false (see `docs/systems/playback.md`).
6. **Play path.** Delivery choice (companion file URL, leftover OPFS blob, or stream) is owned by playback resolution (`resolve.ts`), used by the on-demand player and by `radio/session.ts`, not by re-encoding on the client. After Later, leftover OPFS still plays in HTML until Yes finishes; exclusive only loads companion file URLs into mpv.
7. **Artist thumbs.** Offline thumbs follow `GET /api/artist-image` (preferred bytes first). After a local preferred upload (online submit or flush), `applyPreferredServerResult` overwrites the OPFS artist thumb, publishes a new object URL on `urlCache` (`artist:${id}:thumb`), then revokes the old one. List/tree read that cache and browse `artUrls` under the same keys (`artist:${id}:thumb`, `cover:${albumId}:thumb`). `artistImageUrl` busts on nonzero `preferredRev` even after revert. A queued revert does not change GET bytes until DELETE succeeds.

## Ownership / import surface

Durable split so `index.ts` does not become a barrel:

| Concern | Module |
|---------|--------|
| Init, enable/disable, enqueue, pause/resume, cancel/retry/clear, manager/orphan probes, concurrency setter | `index.ts` |
| Allowed concurrency values, persist, rank-to-keep | `concurrency.ts` |
| User download + migrate confirm | `ui.ts` only |
| Reactive `downloads` fields | `state.ts` |
| Filename / MIME | `media.ts` |
| Catalog projection / UI join | `projection.ts` (via `catalog.ts`) |
| Local art files + blob URLs | `art.ts` (via `catalog.ts`) |
| Catalog write mutex, pin/refcount, finalize, delete | `writer.ts` (via `catalog.ts`) |
| Storage-only catalog row (`CatalogTrackRecord`) | `writer.ts` / `models/track.ts` (no snake aliases; queue snapshot is a `Track`) |
| One catalog view for browse / add-all / tree | `snapshot.ts` |
| Play/cover URL resolution | `resolve.ts` (queue via `playIntent.ts`; radio via `radio/session.ts`) |
| Queue row CRUD / live progress `Map` | `queue.ts` (does not import runtime) |
| Pump + in-flight abort (`freezeActive` / `cancelItem` / `stopAll` / `applyConcurrency`) | `queueRuntime.ts` |
| Download-tier window, sync, forget (not play `preparedKeys`) | `prewarm.ts` |
| Auto-pause / health-work (injected `freeze`) | `queuePolicy.ts` |
| Stream I/O | `worker.ts` (`streamUrl`) |
| Companion blob client | `companionBlob.ts` |
| OPFS leftover migrate | `migrate.ts` |

Import connectivity notes from `connectivity.ts` / `stores/connectivity.ts`, not via downloads re-exports.

## Guardrails

- Do not write or mutate the server library index from the downloads package.
- Do not persist the downloads enable flag off from a cold-start boot failure.
- Do not use the service worker cache as a substitute for offline audio (`docs/systems/pwa.md`).
- Do not grow a new OPFS locker on an installed desktop PWA once the companion backend is live.
- Do not re-grow a god barrel on `index.ts` (re-exporting resolve, catalog, hierarchy, storage formatters, or connectivity).
- Keep secrets and API keys on the server; downloads only consume authenticated-by-network stream URLs like the rest of the SPA.
- Prefer stable track IDs for catalog keys and queue entries over filesystem paths.
