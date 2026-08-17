**Archive.** Decisions in this file were current as of 2026-08-17 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Custom artist art

## Goal

Let the operator set one library-wide preferred artist portrait from a device photo or file, cropped to a square before upload. Every surface that already shows artist art displays that preferred image instead of the scanned or remotely fetched one. Scan and regen keep filling the existing portrait store; they never overwrite or delete the preferred file. Revert removes only the override.

## Settled decisions

- **Artists only.** Album covers stay on the extract/scan path.
- **Device files only.** Native photo/file picker. No camera capture. No picker of album covers or other library art.
- **One preferred override per artist**, stored on the server, visible to every LAN client. Last write wins. No accounts.
- **Two disk stores.** Scanned/fetched portraits stay at `covers/artists/`. Preferred portraits live in a sibling directory so `regen-artist-images --force` and full scan cannot delete them. Scan still fetches as today when the scanned store is empty or force is on.
- **GET `/api/artist-image` serves preferred if present, else scanned, else the in-memory placeholder.** Lists, tree, search, and download fetches stay on one URL.
- **Not a tag editor.** Preferred bytes are never written back into the music library tree.
- **Revert** is one tap in the artist menu when `menuHasPreferred` (server override or pending upload — not a pending revert), confirmed with the themed dialog — not `window.confirm`.
- **Replace** is another Change artist photo; no extra confirm after Use photo.
- **Quiet thumbs.** No “custom” badge. The menu is the only place that says the source (Use library photo is present vs absent).
- **No new artist hero.** The artist album-grid page, search artist rows, downloads library, queue, and now-playing do not grow a portrait or a photo menu.
- **Artist menu** reuses the queue `ActionMenu` shell (extract, do not fork): Add all to playlist; Download all (when downloads are enabled); Change artist photo; Use library photo (only when `menuHasPreferred` — override or pending **upload**, not a pending revert).
- **Surfaces**
  - Artists **list**: `⋯` replaces the chevron; row click still opens the artist; desktop also right-clicks the row.
  - Artists **grid**: desktop right-click only. Phones in grid switch to list to change a photo.
  - Artists **tree**: `⋯` plus desktop right-click; existing plus (“Add all to playlist”) stays.
- **Crop:** locked 1:1, pinch-zoom and drag, Reset framing, Cancel / Use photo. Phone/PWA: full-screen overlay with safe-area. Desktop (≥900px): large centered modal, not the short settings sheet.
- **Desktop drop:** dragging an image onto an artist thumb (list/grid/tree) opens the cropper for that artist. No clipboard paste.
- **Client rasterizes the crop** (canvas) and uploads those pixels. Safari can often decode HEIC from the photo picker; if decode fails, toast to try JPEG or PNG. No new Pillow HEIF dependency and no new frontend npm cropper.
- **Offline / `server_down`:** crop still runs. This device shows the **crop** immediately (`previewUrl`). The blob waits in IndexedDB (one pending per artist). Silent retry when the server is reachable. Toasts on queued / uploaded / failed. Recrop replaces the pending blob. Revert cancels pending and/or queues DELETE for a live override. A queued revert **keeps the current preferred thumb** (or placeholder) until flush DELETE + `applyPreferredServerResult`; the toast already says the library photo returns when the server is back. Do not invent `?source=scanned` and do not pretend a client flag changes GET. No pending-photos manager screen.
- **Download all:** styled confirm with track count and on-device storage wording, then the existing near-quota dialog only if storage is actually tight. Enqueues every not-missing, not-`isLocallyPlayableDownload` track across that artist’s albums. Hidden when downloads are disabled. Zero remaining + some already playable → toast “Already downloaded”; zero playable → “Nothing to download”.
- **Add all to playlist** calls the existing `addAllForArtist` helper. No extra confirm.
- **Cache.** Artist JSON grows `has_preferred_image` and `preferred_rev`. Real-art GET stays `Cache-Control: private, max-age=86400` (`_COVER_HEADERS`). `preferred_rev` is the cache key, not a “has override” badge: every byte change (upload *and* revert) must change the query string. `artistImageUrl` keeps its third `bust` argument. It appends `&rev=<n>` when the first argument is an object with numeric `preferred_rev !== 0`, **whether or not** `has_preferred_image` is true. String ids stay unbusted. `bust` still appends `&t=`. `ensureArtistArtFile` today fetches the unbusted URL; `refreshArtistArtFile` must use the rev-bearing URL and run on the online submit path, not only flush.
- **Anyone on the LAN** can change portraits (network trust, same as playlists).
- **No twin store class.** Preferred files are a second `WebpAssetStore(data_dir / "covers" / "artists-preferred")`. Do not add `preferred_artist_image.py` or `PreferredArtistImageStore`. `ArtistImageStore` and `ArtistImageFetcher` stay scanned-only; do not pass a preferred store into the fetcher or `jobs/runner.py`.
- **GET honesty** lives in `reconcile_artist_image_flags` next to `pick_artist_image_path`. Two independent `if`s: missing preferred pair clears `has_preferred_image`; missing scanned pair clears `has_image`. Both may clear on one GET. Flag honesty uses `preferred.has(id)` / `scanned.has_image(id)` (both full+thumb). Serve uses `get_path` / `image_path` for the requested size. GET never *sets* `has_preferred_image` (POST is the writer). If preferred files exist and the flag is false, GET still serves them. Mutates the `get_db` session and relies on success-commit — no extra commit.
- **POST/DELETE errors** are `PreferredImageTooLarge` and `PreferredImageUndecodable` (`Exception`, not `ValueError`). `media.py` maps them to 413 / 400 like `StreamConflict`. Helpers stay FastAPI-free. Do not register them on `main.py` `_EXCEPTION_STATUS`.
- **Stage 05 is online-only.** Unreachable server → toast; thumb unchanged. No `queuePreferredUpload` stub. Stage 06 changes `submit.ts` (`submitPreferredCrop` / `submitPreferredRevert`) to enqueue when `!canReachServer()` **or** when the helper classifies `offline` / `server_down`. `item_fail` (413 / 400), `abort`, and `unknown` toast and do not enqueue. `pending.ts` does not import `submit.ts`.
- **HTTP classify contract.** `postPreferredArtistImage` / `deletePreferredArtistImage` call **exported** `apiFetch` from `api.ts` (it already attaches `diagRequestHeaders()`). They do **not** use JSON `apiPost` / `apiDelete` and do not invent a third fetch wrapper. Success returns `{ artist, status }`. Failure throws `PreferredRequestError` with numeric `.status` from the Response (network throws have no `.status`). Callers pass `classifyError(err, err.status)`. One field name: `.status`. Never `httpStatus`.
- **Pending boot.** `frontend/src/main.ts` calls `initArtistArtPending()` next to `initDownloads()`. `pending.ts` exports that function. It must not rely on `LibraryView` / `artistMenuItems` import order (Downloads tab does not mount `LibraryView`). On boot: restore overlay from IDB, `setHealthWork("artist-art", hasRows)`, flush if already `online` and not hard-offline.
- **Flush re-arm.** Whenever a pending row is created, or flush fails with `offline` / `server_down` / network: `reportFailure` (unless already hard-offline), `setHealthWork("artist-art", true)`, `requestHealthProbe(0)` if not hard-offline. Keep the IDB row and overlay preview. Do not describe retry as “wait for `onConnectivityRecovered`.” Subscribe to recovered **and** `onConnectivityChange` when the new state is `online`. One in-flight flush at a time.
- **One client overlay.** `artistArt/state.ts` holds a reactive map keyed by `artistId`: `{ previewUrl?: string; hasPreferred: boolean; preferredRev: number; pending?: "upload" | "revert" }`. `coverSrc` prefers `previewUrl`, else `artistImageUrl` with overlay flags merged onto the artist. A pending revert sets `pending: "revert"`, **leaves `hasPreferred` unchanged** (still true for a live override), and revokes/clears `previewUrl`. The thumb stays preferred (or placeholder) until flush DELETE + `applyPreferredServerResult`. GET still serves preferred files if they exist; same `preferredRev` is the same cached URL. `menuHasPreferred` is **false** when `pending === "revert"`; otherwise `overlay.pending === "upload" || overlay.hasPreferred === true || (no overlay entry && artist.has_preferred_image)`. Submit and flush do not mutate list rows or `TreeNode.cover`. Overlay lands in stage 05 (online write-through). Stage 06 only adds `previewUrl` + `pending` + IDB. No separate preview map. Treat `pending` as a tagged union, never as a truthy flag.
- **Acyclic artistArt modules.** `upload.ts` = `postPreferredArtistImage` / `deletePreferredArtistImage` / `applyPreferredServerResult` / `PreferredRequestError` only. `pending.ts` = IDB + `enqueuePreferred` + `flushPending` + `initArtistArtPending` + `rearmArtistArtHealth` (flush imports apply/HTTP from `upload.ts`). `submit.ts` = `submitPreferredCrop` / `submitPreferredRevert` (the only wrap site; imports `upload.ts` and, in stage 06, `pending.ts`). `pending.ts` does not import `submitPreferred*`. No dynamic-import dodge.
- **One HTTP-success writer.** `applyPreferredServerResult(id, artistDict)` (in `artistArt/upload.ts`) writes `{ hasPreferred, preferredRev }` from the dict, revokes/clears `previewUrl`, clears `pending`, then `refreshArtistArtFile(id, artistDict)` if Downloads has that artist. `submitPreferredCrop` / `submitPreferredRevert` and the stage-06 flush both call it after HTTP 200. `pending.ts` writes the overlay only for enqueue / boot restore (`previewUrl` / `pending`).
- **Revoke object URLs.** Revoke the previous `previewUrl` on recrop, queued revert, and successful apply.
- **Download remaining** is collected in `libraryActions.ts` inside `run()`, not at menu-open. `collectArtistDownloadTracks(artistId)` returns `{ remaining: Track[]; playableCount: number }`. `remaining` is not missing and not `isLocallyPlayableDownload(track.id)` (`catalog.ts` — already `ready || other`). Fetch albums with `Promise.all` like `addAllForArtist`. Do not re-derive `ready`/`other`. `playableCount === 0` → toast “Nothing to download”; `remaining.length === 0` && `playableCount > 0` → “Already downloaded”; else styled confirm then `downloadTracks(remaining)`. Styled `confirmDialog` stays in `artistMenuItems`.
- **Tree chrome.** `TreeView` gets optional `resolveCover?: (node) => string` and emits `row-contextmenu` with the original `MouseEvent` and **no** `preventDefault`. Optional `thumbDropEnabled` (default false) gates dragover/drop `preventDefault` + `thumb-drop`. It never contains artist-art or downloads feature checks. `LibraryTreePane` sets `thumbDropEnabled` and binds contextmenu/drop with conditional `v-on` **only when** `mode === "artists"` (so albums/folders/downloads keep the native menu), owns ⋯ / drop / `ActionMenu`, and passes `coverSrc` via `resolveCover` for online artist nodes. When `mode === "downloads"`, `resolveCover` reads the Vue-readable `urlCache` (same key `artist:${id}:thumb` — baked `node.cover` is not enough after refresh). `LibraryView` and `LibraryTreePane` close the menu on `route.fullPath` **and** on `ui.libraryLayout` / `showTree` flip (list→tree unmounts `EntityListHost` but a sibling `ActionMenu` in `LibraryView` would stay open).
- **List host API.** `EntityListHost` takes one optional `artistRowActions` object, default `null`: `{ onMenuClick, onRowContextMenu, onThumbDrop }` plus existing `artistCover`. Do not grow five artist-art props.
- **Menu extract.** `useRowActionMenu` owns open/close/anchor/focus. PlaylistView keeps **index-based toggle** and `slotMatches` (`slotKey` is `id:${track.id}` — two queue rows of the same track share a key). `nextOpenKey` is for artist-id surfaces only.
- **One crop open.** Menu picker and desktop thumb drop both call `openCropFromFile(file)`: reject >8 MiB with the oversize toast; decode with `createImageBitmap` first, `Image` fallback — failure toast, cropper stays closed; else `openImageCropper`.
- **Cropper host.** `artistArt/cropper.ts` + `ImageCropper` mounted next to `AppDialog` in `App.vue`. `frontend/css/cropper.css` is a `<link>` in `frontend/index.html`. Router-safe back: `history.pushState({ ...history.state, musicwebCropper: true }, "", location.href)` on open (preserve Vue Router’s `back` / `current` / `position`; never change path/query). Pop only if `history.state.musicwebCropper` is still on top. `popstate` cancels without uploading. `route.fullPath` must not change on open/close. Do not `pushState({ musicwebCropper: true }, "")`.
- **Pending IDB.** Dedicated database `musicweb-artist-art`, store `pending`, key `artistId`. Not `musicweb-downloads` or `musicweb-diag`.
- **Health loop.** Delete `healthEnabled` / `healthQueueHasWork`. `setHealthWork(source: "downloads" | "artist-art", hasWork)` is the only write. Every gate in `connectivity.ts` ORs the map (`needsHealthProbe`, `syncHealthLoop`, `runHealthProbe`, `requestHealthProbe`, window `online`). `setHealthContext` stays the downloads call shape and writes only `"downloads"`. Not a free-form plugin bus.
- **OPFS refresh.** `refreshArtistArtFile(id, artistDict)` GETs via `artistImageUrl` on that rev-bearing dict (not a hand-built unbusted URL), overwrites OPFS, puts a **new** object URL into the existing `urlCache` in `catalog.ts` (key `artist:${id}:thumb`; same cache `blobUrlFor` / `revokeArtCached` / `getLocalArtistImageUrl` already use), then revokes the previous URL. Promote `urlCache` to a Vue-readable map the same way as `catalogIndex`. `DownloadsLibraryView.artistCover` and downloads-mode `resolveCover` read `urlCache` (not a snapshot `localArt` / baked `node.cover`). Do not add a second `artistArtObjectUrl` map. `applyPreferredServerResult` is the only caller. `ensureArtistArtFile` stays skip-if-present.

## Design

Preferred art is a **display override**, not a replacement of scan. The scanned WebP pair, `artists.has_image`, `image_source`, and the fetch cascade stay the scan system’s. Preferred files are another `WebpAssetStore` root plus `has_preferred_image` / `preferred_rev`. HTTP GET is the single resolution point so the SPA, PWA, and downloads fetch cannot disagree.

The cropper never talks to the server. It yields a square raster (target 1000×1000, matching `FULL_SIZE` in `images/render.py`). POST writes that raster through the existing `WebpAssetStore` encode (full lossless WebP + 200px thumb). The server may center-fit again; a client-square upload is a no-op fit.

While a POST cannot run (`offline` / `server_down` before the request, or a POST/DELETE that classifies as `offline` / `server_down`), stage 06 lets the cropper finish by writing `previewUrl` / `pending` on the same overlay, one `musicweb-artist-art` pending record, and `initArtistArtPending` + re-arm (`reportFailure` + `setHealthWork` + `requestHealthProbe`) so flush runs even when the session opened on Downloads or the POST failed while published `online`. A queued revert only hides “Use library photo” and drops the crop preview; GET still serves the preferred files until DELETE succeeds. HTTP 200 still goes through `applyPreferredServerResult` (online *and* flush) so OPFS refresh + live `urlCache` swap cannot drift.

Menu chrome is the queue pattern extracted into a composable. PlaylistView keeps its items builder. Artist list/grid/tree get their own items builder. Search `ArtistRow`s keep today’s chevron and do not take the menu.

Screen-by-screen mobile and desktop flows: [ux-flows.md](ux-flows.md).

## Stage map

Backend contract first, then reusable chrome, then the surfaces that call both, then the offline queue that wraps the same upload, then living docs.

1. **Preferred store + GET priority** — disk, schema, serve order, scan isolation. Nothing else can resolve “show preferred” until GET is honest.
2. **POST / DELETE** — write and revert the override. Upload UI has nothing to call before this.
3. **Extract row action menu** — independent of art, but list/grid/tree menus must not copy PlaylistView’s open/anchor/contextmenu block.
4. **Image cropper** — independent overlay + pan/zoom math. Change photo is a stub without it.
5. **Artist menus + upload wiring** — list/grid/tree affordances, overlay write-through via `applyPreferredServerResult`, drag-drop and picker through `openCropFromFile`, revert. `upload.ts` is HTTP+apply only; `submit.ts` is the online wrap. Offline is toast-only. Needs 02–04.
6. **Offline pending queue** — adds preview/pending/IDB on the same overlay; `initArtistArtPending` from `main.ts`; `submit.ts` is the only enqueue wrap (`pending.ts` does not import submit\*); re-arm via `reportFailure` + health probe; flush calls the same apply helper; full health-gate rewrite. Needs the online path in 05.
7. **Living docs** — persist the product rules, including connectivity multi-source work. Last so it describes what shipped.

## Out of scope

- Custom album, playlist, or folder art.
- Picking an existing library image (album cover or scanned portrait) as the source.
- In-app camera capture.
- Clipboard paste.
- Artist hero / banner on the album-grid page.
- Photo menu on search, downloads library, queue, or now-playing.
- Per-user overrides or authentication.
- Writing `artist.jpg` (or anything) back into the music library tree.
- A visible pending-photos manager.
- Grid `⋯` or long-press (phones in grid switch to list).
- New frontend npm dependencies or a Pillow HEIF extra.
- HTTP TestClient / `create_app` tests.

## Assumptions

- Network-trust LAN remains the security model; anyone who can reach the port can set or revert a portrait.
- `WebpAssetStore` + `full_thumb_webp_pair` stay the encode path for preferred files (1000 / 200 square WebP).
- Source upload cap stays **8 MiB**, same as `ARTIST_IMAGE_MAX_BYTES` for remote fetch.
- After crop, the short side of the exported square is at least 200px; smaller → toast and stay on the cropper.
- Device B sees a new preferred image on the next artist-list or tree refresh (URL `rev` changes). Already-decoded `<img>` tags on a stale page update when that view reloads data.
- Downloads that already stored a gray placeholder thumb may keep it until a successful preferred POST refreshes that artist’s OPFS file via `applyPreferredServerResult`.
- Android/iOS system back on the full-screen cropper dismisses without uploading. Recipe: `history.pushState({ ...history.state, musicwebCropper: true }, "", location.href)` on open; pop only if that flag is still on top; never change path/query; `route.fullPath` unchanged. `LibraryView` already refuses `history.back()` because it can unload the page. Vue Router owns `history.state` (`back` / `current` / `position`). Do not clobber it with `{ musicwebCropper: true }`. Esc does the same on desktop.
- `setHealthContext` remains the downloads call site; its implementation writes only the `"downloads"` `setHealthWork` source.
- GET honesty mutates the request session and commits on success, same as today’s `has_image` clear. Orphan preferred files with a false flag (crash after write) are served but do not set the flag.
- Real-art responses stay `private, max-age=86400`. `rev` is the only safe bust after revert for this device and the next list fetch on Device B.
- `ensureArtistArtFile` fetches the unbusted URL. After a preferred POST or revert that URL can already hold the previous bytes in the HTTP cache. `refreshArtistArtFile` uses `artistImageUrl` on the rev-bearing dict and runs from `applyPreferredServerResult` (online submit *and* flush).
- `onConnectivityRecovered` fires only on a transition *into* `online`. A flush (or POST) that fails as `server_down` while state is still published `online` will not recover unless `reportFailure` + `requestHealthProbe` run. Window `online` is optimistic.
- `DownloadsLibraryView` copies art into a `localArt` snapshot at load; the downloads tree bakes `node.cover` in `downloadsSource.ts`. Revoke-only leaves those strings pointing at a revoked blob. Promote the existing `urlCache` (key `artist:${id}:thumb`) to a Vue-readable map; those views read it after refresh. Do not add a second object-URL store.
- GET is file-honest: preferred files on disk are served even when `has_preferred_image` is false. A queued revert cannot show scanned bytes through `artistImageUrl` until DELETE removes those files and `applyPreferredServerResult` writes the new dict (`has_preferred_image: false`, bumped `preferred_rev`).
