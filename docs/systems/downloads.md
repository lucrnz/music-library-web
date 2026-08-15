# Offline downloads

Optional client-side offline music: users can download stream-profile audio to the device and play without the server. Complements the PWA shell (shell bootstrap only — offline **audio** is this system).

## Source of truth

- Package: `src/musicweb/static/js/downloads/`
  - Lifecycle / queue actions: `index.js`
  - User download with confirm: `ui.js`
  - Reactive fields: `state.js`
  - Catalog / projection / art / codec helpers: `catalog.js`
  - Queue store and pump side: `queue.js`, `queuePolicy.js`, `worker.js`
  - OPFS binary storage: `opfs.js`
  - IndexedDB metadata: `db.js`
  - Play / cover resolution: `resolve.js`
  - Hierarchy / storage formatters: `hierarchy.js`, `storageInfo.js`
- Settings that affect downloads: `src/musicweb/static/js/stores/settings.js` (download profile, only-on-Wi‑Fi)
- Connectivity signals consumed by queue policy: `src/musicweb/static/js/connectivity.js`, `networkConstraints.js`
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

OPFS is mandatory for resumable Range downloads and partials. Exact object-store and path layouts live in `db.js` / `opfs.js`.

## Behavior (intent)

1. **Optional.** Downloads start disabled until the user enables them; enabling needs OPFS support.
2. **Enqueue.** Pure enqueue / lifecycle lives in `index.js`. User-facing `downloadTrack(s)` in `ui.js` may confirm near-quota, then call enqueue.
3. **Queue.** Background workers fetch the chosen **download** stream profile from the server and write OPFS; catalog records track status (including broken/orphan cases). Lossy-indexed tracks always download the original file (`source`); the download quality picker applies to lossless only.
4. **Network policy.** Auto-pause when hard offline, server unreachable, or (when “only download on Wi‑Fi” is on and connection type is detectable) on constrained/cellular links. User pause is separate from auto-pause.
5. **Catalog projection.** In-memory projection of downloaded tracks feeds UI icons, prepare skip, and tree/list browse of local content.
6. **Play path.** Delivery choice (local blob vs stream) is owned by playback resolution (`resolve.js` + player), not by re-encoding on the client.

## Ownership / import surface

Durable split so `index.js` does not become a barrel:

| Concern | Module |
|---------|--------|
| Init, enable/disable, enqueue, pause/resume, cancel/retry/clear, manager/orphan/near-quota probes | `index.js` |
| User download + near-quota confirm | `ui.js` only |
| Reactive `downloads` fields | `state.js` |
| Catalog projection, record CRUD, status helpers used outside the package | `catalog.js` |
| Play/cover URL resolution | `resolve.js` |
| Queue guts / worker | internals (`queue.js`, `queuePolicy.js`, `worker.js`) |

Import connectivity notes from `connectivity.js` / `stores/connectivity.js`, not via downloads re-exports.

## Guardrails

- Do not write or mutate the server library index from the downloads package.
- Do not use the service worker cache as a substitute for OPFS offline audio (`docs/systems/pwa.md`).
- Do not re-grow a god barrel on `index.js` (re-exporting resolve, catalog, hierarchy, storage formatters, or connectivity).
- Keep secrets and API keys on the server; downloads only consume authenticated-by-network stream URLs like the rest of the SPA.
- Prefer stable track IDs for catalog keys and queue entries over filesystem paths.
