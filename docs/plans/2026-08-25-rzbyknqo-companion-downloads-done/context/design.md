**Archive.** Decisions in this file were current as of 2026-08-25 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Catalog used line and companion-disk Downloads

## Goal

Stop lying about OPFS quota. Show honest catalog used on every OPFS client. On installed desktop Chrome PWAs, store download bytes on real disk via the Desktop companion (one Downloads feature, IDB catalog, companion as a dumb blob store) so HTML and exclusive both play from that store.

## Settled decisions

- **OPFS line:** Settings, manager, and leftover-when-disabled share one string: `N tracks · size`. N is every catalog row (ready + broken + orphan). Size is ready-track audio plus art those albums/artists own (artist thumb, album thumb + full), shared art once. Per-track rows stay audio-only. Partials stay on queue rows. No used/quota/free. No short/long split. Empty copy stays “no downloads yet.”
- **Near-quota:** remove the pre-download confirm and the Settings/manager banners. `QuotaExceededError` still fails the job. Do not chase Chromium’s ~2 GiB `estimate().quota`. `persist()` stays as-is (already requested on downloads boot).
- **Job:** one Downloads feature. Companion holds bytes on disk. HTML and exclusive both consume that store. Android stays OPFS.
- **Catalog of record:** PWA IndexedDB. Companion is fetch / delete / stat / serve keyed by blob key. No second catalog.
- **Who fetches:** companion HTTP-GETs the library stream URL. The browser does not write locker audio.
- **Who may command blobs:** any authenticated companion session, not only the exclusive controller.
- **Codec stored:** same Download quality setting as OPFS. Lossy-indexed tracks still store `source`.
- **Clients:** installed Chrome PWA on Mac, Windows, or Linux → companion required. Android → OPFS. Desktop Chrome **tab** → no new OPFS; toast to use the installed PWA; leftover OPFS may still play in HTML.
- **Connect:** auto-connect / debounce reconnect when Downloads **or** exclusive is enabled and a token is set. Both off → no socket. Token is `COMPANION_TOKEN`.
- **mpv:** still required to start the companion.
- **Settings:** **Desktop companion** (token, port, status, data-dir path) on every installed desktop PWA. **Exclusive audio** (hog, device, format) stays Mac installed PWA only until Windows hog.
- **Data dir:** OS app-support default only (`~/Library/Application Support/musicweb-companion` on macOS; Win/Linux equivalents). No env override. Print the path on every companion launch.
- **HTML play:** token-gated loopback GET with Range. Not a full-file blob in RAM.
- **Exclusive + locker:** same **When a download exists** policy; local file goes to mpv. Download quality and that policy stay visible while exclusive is on. Streaming quality may stay exclusive-hidden.
- **Lossy exclusive:** local file if downloaded; else mpv streams `source`. No FLAC remux. SRC is mpv/OS. `exclusive_lossy` only if we would invent a companion FLAC tag and there is no local file and no source URL.
- **Companion storage line:** `N tracks · used · free` with real OS free on the data-dir volume. Used still follows the catalog rule. Disk full → fail the job, no pre-check.
- **Companion drop:** auto-pause reason `companion` (same shape as `server`).
- **Migrate leftover OPFS** on desktop installed PWA: Yes / Later. Yes transfers then clears OPFS (blocking progress; cancel leaves OPFS). Later snoozes until next boot; leftover still plays; toast reopens the dialog; a new download reopens it as required. End state: no OPFS locker on that client.
- **Platform support (product):** three tiers. **First-party** — Windows, macOS, and Android, any Chromium PWA (Chrome, Brave, Edge, unbranded Chromium; current testing is Chromium/Brave). **Second-party** — Linux Chromium PWA: implement the same desktop features (do not skip Linux); testing is best-effort when someone has a Linux box — do not block a change on Linux testing if you are not on Linux. **Out of scope** — iOS, Safari, Firefox, and everything else: best-effort if the browser happens to work; agents do not implement, test, or prioritize those clients. Feature availability is separate (exclusive hog stays Mac-only; Windows hog is WIP on the exclusive-audio page, not in the platform table).

## Design

```text
                    ┌─ Android PWA / leftover OPFS ─► OPFS + IDB
Downloads feature ──┤
                    └─ Installed desktop PWA ─► IDB catalog
                                                │
                                                ▼
                         Desktop companion blob store (app-support dir)
                                                │
                         GET /files/{key}?token=  (Range)
                                                │
                         ├─ HTML <audio src>
                         └─ exclusive mpv load
```

**OPFS used.** `refreshStorageInfo` stops putting `estimate().quota` on the face. `downloadedBytes` becomes catalog used (ready `track.bytes` + art files flagged on album/artist records). Formatters emit `N tracks · size` or the empty copy. `persist()` and `getStorageEstimate()` may remain as unused helpers until a later cleanup; they must not drive UI or enqueue.

**Backend pick.** `canUseCompanionDownloads()` = desktop Chrome (Mac / Windows / Linux via existing UA + `userAgentData` style) **and** installed PWA. Desktop tab is not that. Tab enqueue/enable toasts and does not write OPFS. Desktop PWA enable/enqueue requires a live companion hello.

**Blob keys.** Path-shaped, jail-checked, same layout as today’s OPFS names:

- audio: `audio/{trackId}.{codec}.{ext}`
- album art: `covers/albums/{albumId}.{size}.webp`
- artist art: `covers/artists/{artistId}.{size}.webp`

Companion rejects `..`, absolute paths, and NUL. Files live under the app-support dir. Writes go to `*.partial` then rename, matching OPFS resume.

**Wire.** `PROTOCOL_VERSION` stays `1`. New WS types (any authenticated session):

| Direction | Type | Role |
|---|---|---|
| C→S | `blob_put` | `{ requestId, key, url, offset? }` companion GETs `url` (library stream) and writes `key` |
| C→S | `blob_abort` | `{ requestId }` |
| C→S | `blob_delete` | `{ key }` |
| C→S | `blob_stat` | `{ key }` |
| C→S | `disk_info` | — |
| S→C | `blob_progress` | `{ requestId, key, loaded, total? }` to the requester |
| S→C | `blob_done` | `{ requestId, key, bytes }` |
| S→C | `blob_error` | `{ requestId, key, code, message }` (`enospc` / `http` / `abort` / …) |
| S→C | `blob_stat_ok` | `{ key, exists, bytes }` |
| S→C | `disk_info_ok` | `{ free }` OS free on the data-dir volume |

Hog commands (`load`, `set_device`, transport) stay controller-only. Heartbeat / `list_devices` unchanged.

**HTTP (loopback FastAPI, same token as hello).**

- `GET /files/{key}?token=` — `Accept-Ranges: bytes`, 401 on bad token, 404 on miss.
- `PUT /files/{key}?token=` — migrate upload from the PWA (OPFS → companion). Not the download-from-library path.

Chrome treats `http://127.0.0.1` as loopback from an HTTPS PWA (same class as today’s `ws://127.0.0.1`). Do not use a full-file `fetch`→blob for playback.

**Queue / jobs.** Pump stays in the PWA. On the companion backend the worker sends `blob_put` with the same stream URL it would have fetched, mirrors progress into the existing live map, and on `blob_done` runs today’s IDB finalize (catalog + refcounts + queue delete). Art `ensure*` sends `blob_put` (or PUT) for cover URLs. Delete unlinks the companion key after IDB, same order as OPFS. Companion socket down → auto-pause `companion`. `ENOSPC` / `blob_error` code `enospc` → job failed.

**Play.** `resolvePlaySource` on the companion backend returns the loopback file URL when the catalog row is playable. Exclusive `resolvePlayIntent` applies the same playback policy; local wins → that URL into mpv; else lossless exclusive FLAC tag stream, lossy `source` stream. `shouldHideBrowserQualityControls` no longer hides Downloads quality or **When a download exists**.

**Migrate.** On desktop-PWA boot, if OPFS catalog rows exist, themed `confirmDialog` Yes / Later. Yes: for each audio/art file, `PUT` to companion, then wipe OPFS; progress on `downloads.migrate`; cancel deletes partial companion keys from this attempt and leaves OPFS. Later: toast; next boot asks again; new download reopens as required.

**Settings.** New Desktop companion section owns token / port / connection / printed data-dir (from `disk_info` or a hello field). Exclusive panel keeps hog enable / device / format and drops token/port. `syncCompanionConnection` after exclusive **and** downloads init.

## Stage map

1. **OPFS catalog line** — independent, user-visible lie today. No companion needed.
2. **Exclusive lossy source stream** — independent playback unlock (mpv streams `source`). Local-file exclusive waits for the locker.
3. **Capability helpers** — desktop / installed / companion-download predicates later stages gate on.
4. **Companion data dir** — OS path + launch print. Blob I/O needs a home.
5. **Companion blob API** — WS + Range GET + PUT + jail + free-space. Client jobs cannot start without this contract.
6. **Settings + connect + enable gates** — token/port split, auto-connect when Downloads or exclusive is on, tab/PWA enable rules. Jobs still OPFS until 07.
7. **Companion download jobs** — worker/art/delete/queue pause/storage free. Produces files 08–09 consume.
8. **Play policy** — HTML + exclusive consume the store; quality/policy visible again.
9. **OPFS migrate** — only after PUT + wipe + play exist so Yes is real.
10. **Living docs** — write durable intent after the shipped contract exists, including the platform-support table in product guidelines plus an `AGENTS.md` pointer. `context/design.md` is not living documentation.

## Out of scope

- Firefox, Safari, iOS
- Exclusive hog on Windows/Linux (companion still runs there for the locker)
- Exclusive-mode radio
- Bit-perfect “always store library originals” as the locker format
- `COMPANION_DATA_DIR` or any env override of the data dir
- Changing `persist()` timing or prompts
- Displaying `estimate().quota` / free
- Companion-owned catalog or a sync protocol
- Electron
- Vue / OPFS / download-worker / sink integration tests (`docs/development/testing.md`)

## Assumptions

- First- and second-party desktop clients are Chromium PWAs (standalone or minimal-ui). UA / `userAgentData` platform strings distinguish OS, not Chrome vs Brave vs Edge.
- Loopback `http://127.0.0.1` media and `fetch` from the HTTPS PWA work on those Chromiums, as today’s companion WebSocket already does.
- `confirmDialog` with confirm **Yes** and cancel **Later** is enough; no third dialog mode.
- Optional `thumbBytes` / `fullBytes` on existing album/artist IDB rows do not require an IndexedDB version bump (no new stores or indexes).
- Companion tests pass a temp `data_dir`; the CLI uses the OS default.
- Linux app-support equivalent is XDG (`$XDG_DATA_HOME/musicweb-companion` or `~/.local/share/musicweb-companion`); Windows is `%LOCALAPPDATA%\musicweb-companion`.
