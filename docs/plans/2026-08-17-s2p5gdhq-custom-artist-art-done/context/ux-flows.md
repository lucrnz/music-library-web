# Custom artist art — mobile and desktop flows

Companion to [design.md](design.md). These are the operator-visible steps. Implementation lives in the stage files.

Breakpoint: `DESKTOP_MEDIA` `(min-width: 900px)` — same as the dual-pane shell and queue `ActionMenu`.

## Shared menu

Order:

1. **Add all to playlist**
2. **Download all** — omitted when downloads are disabled
3. **Change artist photo**
4. **Use library photo** — omitted unless `menuHasPreferred`: pending **upload**, overlay `hasPreferred`, or (no overlay entry and `artist.has_preferred_image`). A pending **revert** hides the item.

Chrome: existing `ActionMenu` (centered `ActionCard` below 900px, `AnchoredMenu` at/above). Close the menu before any `confirmDialog` or file picker.

## Phone / PWA (width &lt; 900px)

### Change photo — list

1. On `/artists` in list layout, tap `⋯` on the artist row (the control that replaced the chevron). Row tap still opens the artist.
2. Action card: Change artist photo.
3. Native file/photo picker (`accept` images). Cancel in the picker returns to the list; no toast. The file goes through `openCropFromFile` (8 MiB toast, decode-fail toast, else cropper).
4. Full-screen crop overlay (safe-area insets): dimmed field, 1:1 mask, the image fills the square at min zoom. Pinch to zoom, drag to pan, **Reset** restores cover-fit. **Cancel** dismisses (system back / overlay Cancel). **Use photo** exports 1000×1000 and continues.
5. If the server is reachable: upload, bust that artist’s thumb, toast on failure only (success is the new thumb).
6. If `offline` / `server_down`: keep the crop as this device’s thumb immediately, persist the blob, toast that it will upload when the server is back.

### Change photo — tree

Same as list, from the artist node’s `⋯`. The plus button still means Add all to playlist only.

### Change photo — grid

No `⋯` and no long-press. Switch to list (or tree) first.

### Revert

1. `⋯` → Use library photo (item only when `menuHasPreferred`).
2. Themed confirm: **Use library photo?** · Remove your photo for {name}? The library portrait will show instead. · **Use library photo** / **Cancel**.
3. Pending blob dropped (revoke its object URL). Live override + pending upload + revert → one revert record, no blob. If a server override exists and the server is reachable, DELETE. If the server is down and an override already exists remotely, queue `{ action: "revert" }` and set overlay `{ pending: "revert", hasPreferred: <unchanged>, preferredRev: <last> }` with `previewUrl` cleared. “Use library photo” is hidden (`pending === "revert"` is not `menuHasPreferred`). The thumb **stays the current preferred** (or placeholder) until flush DELETE + `applyPreferredServerResult`. Toast: the library photo returns when the server is back.

### Download all

1. `⋯` → Download all.
2. Themed confirm (not a browser dialog):

   **Download {name}?**
   {n} tracks will be saved on this device. Already downloaded tracks are skipped.

   **Download** / **Cancel**
3. If nothing remains: no dialog; toast “Already downloaded” when `playableCount > 0`, or “Nothing to download” when `playableCount === 0`.
4. On confirm, call `downloadTracks` for the remaining tracks. Existing near-quota confirm still runs when storage is actually tight.

### Add all to playlist

`⋯` → Add all to playlist, or the tree plus. Same `addAllForArtist` as today. No confirm.

### Drag-and-drop

None on the phone.

## Desktop (width ≥ 900px)

### Change photo — list

1. `⋯` or right-click the row (not the native browser menu). Anchored menu at the click or button.
2. Change artist photo → file picker → large centered crop modal (same 1:1 gestures; wheel zoom is allowed). Esc / Cancel / backdrop dismisses.
3. Use photo → same upload / queue rules as mobile.

### Change photo — grid

Right-click the card. No `⋯`. Card click still opens the artist.

### Change photo — tree

`⋯` or right-click the artist node. Plus stays.

### Drag-and-drop

Dragging a local image file onto the **square thumb** (not the whole row) of a list row, grid card, or tree artist node highlights the thumb and calls `openCropFromFile` for that artist, skipping the menu. Same 8 MiB / decode gates as the picker. Drop on non-image data is ignored. Drop is desktop-only.

### Revert, Download all, Add all

Same items and dialogs as mobile; menu is the anchored dropdown.

## Crop overlay (both)

| Control | Behavior |
|---------|----------|
| Cancel / Esc / system back | Discard the in-memory bitmap; do not write pending or POST |
| Reset | Min zoom, image covers the square, centered |
| Use photo | Export square ≥200px; if smaller, stay on the cropper and toast |
| Choose a different file | Not a button. Cancel and run Change artist photo again |

Decode failure (including HEIC the browser cannot draw): toast “Couldn't read that image. Try JPEG or PNG.” Stay on the list; cropper does not open.

Source file larger than 8 MiB: toast before the cropper opens.

## After a successful upload or revert

- `applyPreferredServerResult` writes the overlay from the response dict (`hasPreferred`, `preferredRev`, clear preview/pending).
- This view’s thumb uses `artistImageUrl` with `&rev=` whenever `preferred_rev !== 0` (including after revert, when `has_preferred_image` is false).
- If this device has that artist in Downloads, `refreshArtistArtFile` overwrites OPFS, publishes a **new** object URL on the existing `urlCache` (Vue-readable; key `artist:${id}:thumb`), then revokes the previous URL. Mounted Downloads list/tree read `urlCache` (not a `localArt` / `node.cover` snapshot). Same apply helper on the online path and on flush.
- Other devices pick up `has_preferred_image` + `preferred_rev` on the next artists list/tree fetch.

## Offline notes

The online `/artists` list is API-backed and is not in the service worker cache. The queue path is for a session that already has artists on screen when the server drops (`!canReachServer()` before POST/DELETE), **or** a POST/DELETE that classifies as `offline` / `server_down` after crop (`item_fail` / `abort` / `unknown` do not enqueue). Opening the PWA with no server still cannot browse artists. Pending boot is `initArtistArtPending()` from `main.ts` (runs on the Downloads tab). Flush re-arms with `reportFailure` + `requestHealthProbe`, not “wait for recovered.” A queued revert sets `pending: "revert"` (keep `hasPreferred` / last `preferredRev`, revoke preview). The thumb stays preferred until DELETE succeeds. “Use library photo” is gone. The toast says the library photo returns when the server is back.
