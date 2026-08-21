# Offline downloads

Optional client-side offline music: users can download stream-profile audio to the device and play without the server. Complements the PWA shell (shell bootstrap only — offline **audio** is this system).

## Source of truth

- Package: `frontend/src/downloads/`
  - Lifecycle / queue actions: `index.ts`
  - User download with confirm: `ui.ts`
  - Reactive fields: `state.ts`
  - Filename / MIME: `media.ts`
  - Catalog / projection / art / records + write mutex: `catalog.ts`
  - Queue store and pump side: `queue.ts`, `queuePolicy.ts`, `worker.ts`
  - OPFS binary storage: `opfs.ts`
  - IndexedDB metadata: `db.ts` (no `blobs` store; binaries live in OPFS)
  - Play / cover resolution: `resolve.ts`
  - Hierarchy / storage formatters: `hierarchy.ts`, `storageInfo.ts`
  - Offline browse loader: `browse.ts` (`loadDownloadsView` → `LibraryPage`)
- Offline browse UI is `LibraryView` (`mode === "downloads"`), not a second library SFC. Source pieces: `frontend/src/components/library/sources/downloadsBrowse.ts`. Row covers: omitted/`null` `coverSrc` = remote fallback; `""` = placeholder (do not hit `/api/cover` when local art is missing).
- Settings that affect downloads: `frontend/src/stores/settings.ts` (download profile)
- Connectivity signals consumed by queue policy: `frontend/src/connectivity.ts`
- PWA shell boundary: `docs/systems/pwa.md`
- Playback resolution: `docs/systems/playback.md`

## Purpose

Keep a **device-local catalog** of tracks the user chose to download, so playback and browsing can continue when the LAN server is unreachable. Downloads never write the server SQLite index or library tree.

## Storage split

| Concern | Where |
|---------|--------|
| Audio binaries (and cover art files used offline) | Origin Private File System (OPFS) — required |
| Track/album/artist records, download queue, lyrics cache for offline | IndexedDB under the downloads package |
| Feature enable flag | Client preference storage (local) |

OPFS is mandatory for resumable Range downloads and partials. Exact object-store and path layouts live in `db.ts` / `opfs.ts`. Catalog commit/delete run under a module mutex. A finished job finalizes as one IDB transaction (catalog row + refcounts + queue delete); art network I/O runs after. Delete drops IDB first, then unlinks OPFS.

## Behavior (intent)

1. **Optional.** Downloads start disabled until the user enables them; enabling needs OPFS support. A failed cold-start boot (`initDownloads`) must not persist the enable flag off — only explicit disable, or a failed explicit enable, writes it false.
2. **Enqueue.** Pure enqueue / lifecycle lives in `index.js`. User-facing `downloadTrack(s)` in `ui.js` may confirm near-quota, then call enqueue.
3. **Queue.** Background workers fetch the chosen **download** stream profile from the server and write OPFS; catalog records track status (including broken/orphan cases). Lossy-indexed tracks always download the original file (`source`); the download quality picker applies to lossless only. Original-file extension and MIME are defined for MP3 and AAC only.
4. **Network policy.** Auto-pause when hard offline or server unreachable. User pause is separate from auto-pause.
5. **Catalog projection.** In-memory projection of downloaded tracks feeds UI icons, prepare skip, and tree/list browse of local content. `trackDownloadState` `ready` / `other` means a playable local file — playback uses that join to gray and skip undownloaded queue rows when `connectivity.canUseRemote` is false (see `docs/systems/playback.md`).
6. **Play path.** Delivery choice (local blob vs stream) is owned by playback resolution (`resolve.js` + player), not by re-encoding on the client.
7. **Artist thumbs.** Offline thumbs follow `GET /api/artist-image` (preferred bytes first). After a local preferred upload (online submit or flush), `applyPreferredServerResult` overwrites the OPFS artist thumb, publishes a new object URL on `urlCache` (`artist:${id}:thumb`), then revokes the old one. List/tree read that cache. `artistImageUrl` busts on nonzero `preferred_rev` even after revert. A queued revert does not change GET bytes until DELETE succeeds.

## Ownership / import surface

Durable split so `index.ts` does not become a barrel:

| Concern | Module |
|---------|--------|
| Init, enable/disable, enqueue, pause/resume, cancel/retry/clear, manager/orphan/near-quota probes | `index.ts` |
| User download + near-quota confirm | `ui.ts` only |
| Reactive `downloads` fields | `state.ts` |
| Filename / MIME | `media.ts` |
| Catalog projection, record CRUD, art, write mutex, finalize | `catalog.ts` |
| Play/cover URL resolution | `resolve.ts` |
| Queue guts / worker | internals (`queue.ts`, `queuePolicy.ts`, `worker.ts`) |

Import connectivity notes from `connectivity.js` / `stores/connectivity.js`, not via downloads re-exports.

## Guardrails

- Do not write or mutate the server library index from the downloads package.
- Do not persist the downloads enable flag off from a cold-start boot failure.
- Do not use the service worker cache as a substitute for OPFS offline audio (`docs/systems/pwa.md`).
- Do not re-grow a god barrel on `index.js` (re-exporting resolve, catalog, hierarchy, storage formatters, or connectivity).
- Keep secrets and API keys on the server; downloads only consume authenticated-by-network stream URLs like the rest of the SPA.
- Prefer stable track IDs for catalog keys and queue entries over filesystem paths.
