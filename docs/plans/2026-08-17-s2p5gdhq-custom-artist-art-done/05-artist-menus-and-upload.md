# Stage 05: Artist menus and upload wiring

## Status
done

## Description

Add the queue-style artist menu on the online artists **list**, **grid**, and **tree** only, and wire Change artist photo / Use library photo to the cropper and the stage 02 API. Include Add all to playlist, Download all with the styled confirm, desktop thumb drop, and a reactive artist-art overlay so thumbs cache-bust without mutating list rows or `TreeNode.cover`. Offline is toast-only — the overlay does not change and nothing is queued. Stage 06 only adds preview/pending/IDB on this overlay.

## Rationale

This is the first operator-visible slice: the surfaces and the happy-path upload/revert. The overlay is the single client source of truth so flush in stage 06 does not have to hunt Vue rows. `applyPreferredServerResult` is the only HTTP-success writer (overlay + OPFS refresh) so stage 06 cannot grow a second path. Toast-only offline keeps the stage independently shippable.

## Invariants

- Search `ArtistRow`s keep the chevron and do not open this menu.
- Downloads library and the artist album-grid page do not gain `⋯` or contextmenu for artists.
- Grid has no `⋯`. Desktop right-click only. No long-press.
- List `⋯` replaces the chevron. Row click still navigates. `⋯` is `click.stop`.
- Tree plus remains Add all only. Tree `⋯` + desktop right-click open the full menu.
- `TreeView` has optional `resolveCover?: (node) => string` and emits `row-contextmenu` with the original `MouseEvent` and **no** `preventDefault`. Optional `thumbDropEnabled` (default false) gates dragover/drop `preventDefault` + `thumb-drop`. It never contains artist-art or downloads feature checks. `LibraryTreePane` sets the prop and binds those listeners with conditional `v-on` **only when** `mode === "artists"`. Downloads / albums / folders keep the native context menu.
- `LibraryView` and `LibraryTreePane` close the menu on `route.fullPath` **and** on `ui.libraryLayout` / `showTree` flip. List→tree unmounts `EntityListHost` but a sibling `ActionMenu` in `LibraryView` would stay open.
- Close the menu before `confirmDialog` or the file picker (`ActionMenu` already closes then `run()`).
- `artistImageUrl` keeps its third `bust` argument. Append `&rev=<n>` when the first argument is an object with numeric `preferred_rev !== 0`, **whether or not** `has_preferred_image` is true. String ids stay unbusted. `bust` still appends `&t=`. `coverSrc` calls this helper; do not fork URL building.
- One overlay in `artistArt/state.ts`. HTTP success goes through `applyPreferredServerResult` only. It does not mutate list `ArtistListItem`s or `TreeNode.cover`.
- POST/DELETE use query `artist_id` and multipart field `file`. Artist TypeScript type stays snake_case (`has_preferred_image`, `preferred_rev`).
- `postPreferredArtistImage` / `deletePreferredArtistImage` call **exported** `apiFetch` from `api.ts` (attaches `diagRequestHeaders()`). They do **not** use JSON `apiPost` / `apiDelete`. Success returns `{ artist, status }`. Failure throws `PreferredRequestError` with numeric `.status` from the Response (network failures have no `.status`). Callers use `classifyError(err, err.status)`. Field name is `.status`, never `httpStatus`.
- When `!canReachServer()`, show a toast and do not POST, DELETE, or write the overlay. On a reached-server failure, toast `item_fail` / `abort` / `unknown` and do not write the overlay. No `queuePreferredUpload` stub. Stage 06 is what enqueues `offline` / `server_down`.
- `EntityListHost` takes one optional `artistRowActions` object, default `null`: `{ onMenuClick, onRowContextMenu, onThumbDrop }` plus existing `artistCover`. Do not grow five artist-art props. Only the online artists index passes it.
- Menu picker and desktop thumb drop both call `openCropFromFile(file)`.

## Risks

- A parent that always listens for `row-contextmenu` and no-ops will kill right-click on every tree. Conditional `v-on` is required. `preventDefault` on contextmenu belongs in the artists-mode parent, not TreeView.
- Baking a new `node.cover` after POST will drift from the overlay. Do not rewrite `node.cover`.
- Gating `&rev=` on `has_preferred_image` makes DELETE’s rev bump a no-op for `<img>` and Device B. Tests must lock revert (`has_preferred_image: false`, `preferred_rev: 2`) still emits `rev=2`.
- `revokeArtCached` alone leaves `DownloadsLibraryView.localArt` and downloads-tree `node.cover` pointing at a revoked blob. Refresh must publish a new URL on the existing `urlCache` (make it Vue-readable) and those views must read it. Do not add a second object-URL map.
- `LibraryView.vue` / `LibraryTreePane.vue` must stay menu hosts only — items live in `artistMenuItems.ts`.

## Implementation

### Files

- Create: `frontend/src/artistArt/state.ts` (reactive `Map<artistId, { previewUrl?: string; hasPreferred: boolean; preferredRev: number; pending?: "upload" | "revert" }>`, `coverSrc(artist)`, `menuHasPreferred(artist)`, revoke-preview helper)
- Create: `frontend/src/components/library/artistMenuItems.ts`
- Create: `frontend/src/artistArt/upload.ts` (`PreferredRequestError` with numeric `.status`; `postPreferredArtistImage` / `deletePreferredArtistImage` via exported `apiFetch`, return `{ artist, status }` or throw `PreferredRequestError`; `applyPreferredServerResult`). **No** `submitPreferred*` here.
- Create: `frontend/src/artistArt/submit.ts` (`submitPreferredCrop` / `submitPreferredRevert` — online-only in this stage; import apply/HTTP from `upload.ts`)
- Create: `frontend/tests/artistArt/uploadClassify.test.ts` — helper attaches numeric `.status` on 413/400/500; `classifyError(err, err.status)` is `item_fail` / `item_fail` / `server_down`; `upload.ts` imports `apiFetch`, not `apiPost` / `apiDelete`
- Create: `frontend/src/artistArt/pickFile.ts` (hidden `input type=file` accept `image/*`; `openCropFromFile(file)` — 8 MiB toast, decode-fail toast, else `openImageCropper`)
- Create: `frontend/tests/library/artistMenuItems.test.ts`
- Create: `frontend/tests/artistArt/artistImageUrl.test.ts` — preferred on → `rev=1`; revert (`has_preferred_image: false`, `preferred_rev: 2`) → still `rev=2`; string id → no `rev`; `bust` still adds `&t=`
- Create: `frontend/tests/artistArt/state.test.ts` — `coverSrc` prefers overlay rev over the artist object; pending revert **leaves `hasPreferred` true** (thumb stays preferred URL) and `menuHasPreferred` is false; `menuHasPreferred` is false when `pending === "revert"`, else `pending === "upload"` or `hasPreferred` or (no overlay && artist flag) — **not** a truthy `pending`
- Change: `frontend/src/api.ts` (`ArtistListItem` fields; `artistImageUrl` reads `preferred_rev` off an artist object, keeps `bust`; **export** `apiFetch`)
- Change: `frontend/src/components/library/rows/ArtistRow.vue` (`showMenu` default false; `⋯` vs chevron)
- Change: `frontend/src/components/library/rows/ArtistCard.vue` (desktop `contextmenu` only when enabled)
- Change: `frontend/src/components/library/EntityListHost.vue` (optional `artistRowActions` + existing `artistCover`; use `coverSrc` via `artistCover` when the artists index passes it)
- Change: `frontend/src/components/library/LibraryView.vue` (host list/grid `ActionMenu` + `useRowActionMenu`; close on `route.fullPath` and on `ui.libraryLayout` / `showTree`; enable when the browse body is the artists index, not when `routeName === 'artist'`)
- Change: `frontend/src/components/tree/TreeView.vue` (optional `resolveCover`; emit `row-contextmenu` without `preventDefault`; optional `thumbDropEnabled`; no artist/downloads feature checks)
- Change: `frontend/src/components/tree/LibraryTreePane.vue` (own tree `ActionMenu` and ⋯; close on `route.fullPath` and on `ui.libraryLayout` / `showTree`; `thumbDropEnabled` + conditional `v-on` only when `mode === "artists"`; pass `resolveCover` that calls `coverSrc` for artist nodes)
- Change: `frontend/src/components/library/libraryActions.ts` (`collectArtistDownloadTracks` → `{ remaining, playableCount }`; call `isLocallyPlayableDownload`; `Promise.all` album fetches like `addAllForArtist`; no dialog)
- Change: `frontend/src/downloads/catalog.ts` (`refreshArtistArtFile(id, artistDict)` — `artistImageUrl` on the dict, overwrite OPFS, new object URL into existing `urlCache` key `artist:${id}:thumb`, then revoke the previous URL; promote `urlCache` to a Vue-readable map like `catalogIndex`; `getLocalArtistImageUrl` / `blobUrlFor` keep writing that same cache)
- Change: `frontend/src/components/downloads/DownloadsLibraryView.vue` (`artistCover` reads `urlCache` / `getLocalArtistImageUrl`, not only the `localArt` snapshot)
- Change: `frontend/src/components/tree/LibraryTreePane.vue` — when `mode === "downloads"`, pass `resolveCover` that reads `urlCache` for artist nodes (do not rewrite `node.cover`)
- Do not create: `frontend/src/artistArt/preview.ts` or `coverSrc.ts` (those names are the overlay; live in `state.ts`)

### Steps

1. Overlay type: `{ previewUrl?: string; hasPreferred: boolean; preferredRev: number; pending?: "upload" | "revert" }`. Stage 05 only writes `hasPreferred` / `preferredRev` (via `applyPreferredServerResult`). Formulas:

   ```
   coverSrc(artist):
     overlay.previewUrl
     ?? artistImageUrl({
          ...artist,
          has_preferred_image: overlay.hasPreferred ?? artist.has_preferred_image,
          preferred_rev: overlay.preferredRev ?? artist.preferred_rev,
        })
     — a pending revert does **not** flip hasPreferred. GET still serves
       preferred files if they exist; same preferredRev is the same cached URL.

   menuHasPreferred(artist):
     overlay.pending === "revert" → false
     else overlay.pending === "upload"
       || overlay.hasPreferred === true
       || (no overlay entry && artist.has_preferred_image)
   ```

2. `buildArtistMenuItems({ artist, downloadsEnabled })` — `hasPreferred` comes from `menuHasPreferred(artist)` inside the builder, not a loose boolean from the caller:
   - Add all → `addAllForArtist(artist.id)`
   - Download all if enabled → **inside `run()`**: `{ remaining, playableCount } = await collectArtistDownloadTracks(artist.id)`, then toast or styled confirm, then `downloadTracks(remaining)`
   - Change artist photo → picker → `openCropFromFile` → `submitPreferredCrop`
   - Use library photo if `menuHasPreferred(artist)` → confirm → `submitPreferredRevert`
   Artist hosts toggle with `nextOpenKey` (artist id). Do not change PlaylistView’s index toggle.

3. Download confirm copy stays in `artistMenuItems` `run()`: title `Download {name}?`; message `{n} tracks will be saved on this device. Already downloaded tracks are skipped.`; confirm `Download`. `playableCount === 0` → toast `Nothing to download`; `remaining.length === 0` && `playableCount > 0` → toast `Already downloaded`; else confirm then `downloadTracks(remaining)`. `remaining` is not missing and not `isLocallyPlayableDownload(track.id)` (`catalog.ts`). `collectArtistDownloadTracks` fetches albums with `Promise.all` like `addAllForArtist`. Do not re-derive `ready`/`other`. Near-quota remains inside `downloadTracks`. Fetch still happens inside `run()`, not at menu open.

4. Revert confirm: title `Use library photo?`; message `Remove your photo for {name}? The library portrait will show instead.`; confirm `Use library photo`.

5. HTTP helpers in `upload.ts`: `apiFetch` POST/DELETE with query `artist_id` and multipart `file`. Do not call `apiPost` / `apiDelete`. 2xx → `{ artist: artist_dict, status }`. !ok → throw `PreferredRequestError` with numeric `.status = res.status`. Network failures have no `.status`. `applyPreferredServerResult(id, artistDict)`: set overlay `{ hasPreferred, preferredRev }` from the dict, revoke/clear `previewUrl`, clear `pending`, then `refreshArtistArtFile(id, artistDict)` if Downloads has that artist.

   `submit.ts` (this stage, online-only): `submitPreferredCrop` / `submitPreferredRevert` import apply/HTTP from `upload.ts`. If `!canReachServer()`, toast and return. Else POST/DELETE, then `applyPreferredServerResult`. On throw: `classifyError(err, err.status)` — toast; do not write the overlay; do not enqueue. Do not assign into list rows or `node.cover`. Stage 06 is the only file that will import `pending.ts` from `submit.ts`. `upload.ts` never imports `submit.ts` or `pending.ts`.

5b. `refreshArtistArtFile(id, artistDict)` in `catalog.ts`: GET `artistImageUrl(artistDict, "thumb")` (rev-bearing). Overwrite the OPFS thumb. Create a **new** object URL, assign it on the existing `urlCache` at `artist:${id}:thumb` (promote `urlCache` to a Vue-readable map like `catalogIndex`; `blobUrlFor` / `revokeArtCached` / `getLocalArtistImageUrl` keep using it), then revoke the previous URL. `DownloadsLibraryView.artistCover` reads that cache (snapshot `localArt` is not the live source). Downloads-mode `LibraryTreePane` passes `resolveCover` that reads the same cache for artist nodes. `ensureArtistArtFile` stays skip-if-present. `applyPreferredServerResult` is the only caller. Do not add `artistArtObjectUrl`.

6. `openCropFromFile(file)`: reject >8 MiB with the oversize toast (cropper stays closed); decode with `createImageBitmap` first, `Image` fallback — failure toast, cropper stays closed; else `openImageCropper`. Menu picker and desktop thumb drop both call it.

7. List/grid: pass `artistCover: coverSrc` and `artistRowActions` only from the artists index host. `⋯` `aria-label` “Artist actions”.

8. Grid: no overflow button; `@contextmenu` on the card when desktop and menus enabled.

9. Tree: `⋯` in `#group-actions` for `node.kind === 'artist'` only when `mode === "artists"`. Bind `@row-contextmenu` / `@thumb-drop` and set `thumbDropEnabled` only in that mode. On `row-contextmenu`, the pane `preventDefault`s. Plus unchanged. Host the tree `ActionMenu` in `LibraryTreePane`. Close that menu on `route.fullPath` and on `ui.libraryLayout` / `showTree` flip. Same close rule on the list/grid `ActionMenu` in `LibraryView`.

10. Desktop drop: thumb wrap only; highlight; `files[0]` through `openCropFromFile`. TreeView must not `preventDefault` dragover unless `thumbDropEnabled`.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually against a running `uv run musicweb` + `pnpm --dir frontend dev`:

- List `⋯` and desktop row right-click; row tap still opens the artist. Route change **and** list↔tree / layout flip close the menu.
- Grid: desktop right-click only; phone has no menu.
- Tree: plus still queues; `⋯` / right-click has all items; after upload the **tree** thumb updates without rewriting `node.cover` (overlay + `resolveCover`).
- Search artist rows: chevron, no `⋯`. Downloads / albums / folders tree: native right-click still works (TreeView did not `preventDefault`).
- Change photo → crop → Use: list/tree thumbs update via overlay rev; `GET /api/artist-image` is the new image; scanned files still exist if they did before.
- Use library photo restores the scanned (or placeholder) thumb **and** the URL still has `&rev=` (nonzero).
- Download all shows the styled modal with a real remaining count; cancel does not enqueue. Opening the menu does not fetch every album. All-already-playable vs no-playable-tracks hit the two different toasts.
- Drop a JPEG on a desktop thumb opens the cropper for that artist. An oversize drop toasts and does not open the cropper.
- Stop the server, Change photo → crop → Use: toast, overlay unchanged.

## Acceptance

- [ ] Menu items and visibility match [ux-flows.md](context/ux-flows.md).
- [ ] Search, downloads, and the artist album-grid page have no photo menu.
- [ ] Upload and revert persist on the server. Thumbs update via the overlay (`preferred_rev`), not list-row or `TreeNode.cover` mutation.
- [ ] `artistImageUrl` tests: preferred on → `rev=1`; revert (`has_preferred_image: false`, `preferred_rev: 2`) → `rev=2`; string id → no `rev`.
- [ ] `TreeView` has no `kind === "artist"` / downloads feature checks. `resolveCover` is optional. It does not `preventDefault` contextmenu. `thumbDropEnabled` defaults false. Contextmenu/drop listeners exist only in artists mode.
- [ ] PlaylistView still toggles the queue menu by **index**.
- [ ] Scan-fetched files are still on disk after a preferred upload.
- [ ] Download all confirm is `confirmDialog` in `artistMenuItems`. `collectArtistDownloadTracks` lives in `libraryActions.ts`, returns `{ remaining, playableCount }`, calls `isLocallyPlayableDownload`, and fetches albums with `Promise.all`.
- [ ] Offline / `server_down` toasts and does not write the overlay. No `queuePreferredUpload`.
- [ ] `PreferredRequestError` exposes numeric `.status`. Helpers use exported `apiFetch` and do not import `apiPost` / `apiDelete`. Tests lock 413/400 → `item_fail`, 5xx → `server_down`.
- [ ] Overlay lives in `artistArt/state.ts`. HTTP+apply live in `upload.ts`. Submit lives in `submit.ts`. HTTP success goes through `applyPreferredServerResult` (overlay + `refreshArtistArtFile`). No second preview map. No `upload.ts` ↔ `pending.ts` cycle (pending does not exist yet; do not put enqueue in `upload.ts`).
- [ ] `refreshArtistArtFile` uses `artistImageUrl` on the dict, publishes a new object URL on `urlCache` (`artist:${id}:thumb`), then revokes the old one. `DownloadsLibraryView.artistCover` and downloads-tree `resolveCover` read `urlCache`.
- [ ] `LibraryView` / `LibraryTreePane` close menus on `route.fullPath` and on `ui.libraryLayout` / `showTree`.
- [ ] Picker and drop share `openCropFromFile`.
