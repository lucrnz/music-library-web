# Stage 01: Downloads public API cleanup

## Status
done

## Description

Clean the downloads public surface without merging modules yet.

- Rename pure enqueue exports in `downloads/index.js` from `downloadTrack` / `downloadTracks` to `enqueueTrack` / `enqueueTracks`.
- Keep `downloadTrack` / `downloadTracks` only on `downloads/ui.js` (near-quota confirm + call enqueue).
- **Delete** `onDownloadCodecChanged` from `index.js` **and** its call site in `stores/settings.js` (`setDownloadCodec` dynamic import). Reactive `settings.download` is enough for UI status.
- **Keep** `onNetworkConstraintChanged` (real side effects).
- Stop re-exporting `noteServerReachable` / `noteServerUnreachable` from `downloads/index.js`; callers import `stores/connectivity.js` directly.
- Leave queue/catalog file layout unchanged in this stage.

## Rationale

Dual `downloadTrack` names and connectivity re-exports make `index.js` a god barrel. The codec no-op is not only a dead export — settings still optional-chains into it. Removing export + call site deletes the ceremony entirely before hard-cutover merges.

## Implementation

1. Grep for `downloadTrack`, `downloadTracks`, `onDownloadCodecChanged`, and connectivity imports from `downloads/index.js`.
2. Rename pure enqueue in `index.js`; delete `onDownloadCodecChanged` export.
3. In `setDownloadCodec` (`settings.js`), remove the `import("../downloads/index.js").then((m) => m.onDownloadCodecChanged?.())` path. Leave network-constraint notify path intact.
4. Point `ui.js` at `enqueueTrack(s)`; components keep importing user actions from `ui.js`.
5. Point any connectivity note imports at `stores/connectivity.js`.
6. Smoke: change download codec in settings (icons still react); near-quota confirm still gates UI downloads; enable/disable and boot still work.
