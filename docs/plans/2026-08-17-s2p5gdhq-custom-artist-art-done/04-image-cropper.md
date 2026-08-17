# Stage 04: Image cropper

## Status
done

## Description

Ship a 1:1 pan/zoom cropper overlay and the math that clamps framing. Mobile is a full-screen safe-area overlay; desktop is a large centered modal. No network calls. No new npm package.

## Rationale

Change photo and desktop drop both end on the same crop. Isolating gestures and export here keeps stage 05 to menu wiring and POST. Pure clamp/export helpers are what we can test; the SFC is chrome.

## Invariants

- Aspect is locked 1:1. No freeform control.
- Min zoom: the image always covers the square (no letterbox inside the mask). Max zoom is a fixed multiple (8× min zoom).
- Export is a square raster whose edge is `min(1000, floor(sourceCropPx))` and at least 200. Below 200 the overlay stays open and the caller is told to toast.
- `stores/modalLock.ts` token `"image-cropper"` while open. Do not toggle `body.modal-open` directly.
- Cancel / Esc / system back discards the bitmap and does not resolve the promise with a blob.
- Decode: `createImageBitmap` first, `Image` fallback. Failure is a rejected open (stage 05 toasts), not a blank cropper.
- Router-safe back: on open, `history.pushState({ ...history.state, musicwebCropper: true }, "", location.href)`. Never change path/query. Pop only if `history.state.musicwebCropper` is still on top. `popstate` cancels and does not resolve with a blob. `route.fullPath` does not change on open/close. Do not `pushState({ musicwebCropper: true }, "")`.

## Risks

- Pinch and two-pointer pan on iOS PWA are easy to get wrong if wheel/pointer code fights touch scrolling. Prevent default on the canvas only.
- An unpaired dummy history entry steals the next real back navigation. A raw `{ musicwebCropper: true }` clobbers Vue Router’s `history.state` (`createWebHistory()`).

## Implementation

### Files

- Create: `frontend/src/artistArt/cropMath.ts` (min/max zoom, clamp offset, source crop rect from view state)
- Create: `frontend/src/artistArt/exportCrop.ts` (draw to canvas, `toBlob` WebP with JPEG fallback)
- Create: `frontend/src/artistArt/cropper.ts` (reactive open state + `openImageCropper(file) => Promise<Blob | null>`, same singleton shape as `stores/dialog.ts`)
- Create: `frontend/src/components/artistArt/ImageCropper.vue`
- Create: `frontend/css/cropper.css`
- Create: `frontend/tests/artistArt/cropMath.test.ts`
- Change: `frontend/src/components/App.vue` (mount `<ImageCropper />` next to `<AppDialog />`)
- Change: `frontend/index.html` (add `<link rel="stylesheet" href="./css/cropper.css" />` after the existing `frontend/css/` links)

### Steps

1. Table-drive `cropMath`: image 3000×2000 vs 2000×3000 vs 1000×1000; min zoom covers the square; pan cannot expose edges; reset recenters at min zoom.
2. `ImageCropper` UI per [ux-flows.md](context/ux-flows.md): mask, Reset, Cancel, Use photo. Below 900px: `position: fixed` inset 0, safe-area padding. At/above 900px: centered modal large enough for a ~min(80vw, 80vh, 560px) canvas — not `.modal-sheet` from settings.
3. Pointer: one pointer drags; two pointers pinch (distance → zoom around midpoint); desktop wheel zooms around cursor. Reset control visible on both.
4. Use photo: compute source square via `cropMath`, draw at export size, `toBlob('image/webp')` then `image/jpeg` if WebP blob is null. Resolve the `openImageCropper` promise with the blob.
5. `openImageCropper(file: File | Blob): Promise<Blob | null>` (`null` = cancel). Decode with `createImageBitmap` first, then `Image`; reject (do not open) on failure. On open: acquire modal lock, `history.pushState({ ...history.state, musicwebCropper: true }, "", location.href)`. On Cancel / Use / Esc: pop that entry only if `history.state.musicwebCropper` is still on top, release the lock, resolve. On `popstate`: treat as Cancel (resolve `null`, do not upload). `route.fullPath` must be unchanged after open and after close. Caller owns toasts for decode failure and oversize (stage 05).
6. No file input inside the cropper (picker stays with the caller so drop and menu share one crop).
7. Do not leave a temporary open-hook in `App.vue` or `main.ts`. Manual cropper test waits for stage 05, or uses a test-only entry that is **not** committed.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually (after stage 05 menu is wired, or via an uncommitted test-only entry — do not leave a hook in the tree): pinch/drag on a phone; wheel/drag on desktop; Reset; Cancel; Use; Esc; Android back dismisses without leftover history and without changing `route.fullPath` (one Back after cancel leaves the artists page, not a blank cropper).

## Acceptance

- [ ] `cropMath` tests lock cover-fit min zoom and edge clamping for landscape, portrait, and square sources.
- [ ] Export is square, ≥200 and ≤1000 on a side, WebP or JPEG blob.
- [ ] Mobile chrome is full-screen; desktop chrome is a large center modal.
- [ ] `App.vue` mounts one `ImageCropper`. `index.html` links `cropper.css`.
- [ ] Cancel / Esc / system back resolve `null` and do not leave an extra history entry. `route.fullPath` is unchanged on open/close. History push copies `history.state` and only adds `musicwebCropper`.
- [ ] Decode is `createImageBitmap` then `Image`. Failure rejects open (no blank cropper).
- [ ] No temporary open-hook remains in `App.vue` / `main.ts`.
- [ ] No npm cropper dependency. Modal lock is acquired and released.
