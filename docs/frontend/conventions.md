# Frontend conventions

## Source of truth

- Entry: `src/musicweb/static/js/main.js`
- Router: `src/musicweb/static/js/router.js`
- HTTP helpers: `src/musicweb/static/js/api.js`
- App shell: `src/musicweb/static/js/components/App.js`
- Client stores: `src/musicweb/static/js/stores/`
- Vendor pin registry: `src/musicweb/vendor_deps.py`
- HTML shell + import map: `src/musicweb/templates/index.html`

## Architecture

- **No bundler / no Node.** Browser loads Vue and Vue Router as ESM from `/static/vendor/` via import map.
- **SPA fallback:** FastAPI serves the same shell for client routes so refresh works on `/folders`, `/artists/…`, etc.
- **Stores** hold player, playlist/queue, settings, UI chrome, and downloads state. Components should prefer store APIs over ad-hoc globals.
- **Library UI** lives under `components/library/`; player under `components/player/`; settings modal under `components/settings/`.
- **Downloads** (`static/js/downloads/`) implement client-side offline catalog (OPFS, workers). Keep offline concerns out of server index code.

## Vendor assets

Pinned package versions and CDN URLs live only in `vendor_deps.py`. On startup, missing or version-mismatched files are downloaded into `static/vendor/` and recorded in a local manifest. `static/vendor/**` is gitignored except a keep file.

To upgrade Vue/Router: change version + URL in `vendor_deps.py` and restart with network available.

## UX conventions

- Mobile: bottom tab bar + mini-player / expanded now-playing.
- Desktop: two-pane library + playlist with persistent player bar (breakpoint owned by CSS).
- Codec list in settings reflects **probed** browser decode support (`codecSupport.js` / related probes), not a static marketing list alone.

## Guardrails

- Do not introduce a Vite/webpack/npm app shell without an explicit decision (see technical decisions).
- Prefer stable track IDs in client state and playlist APIs over raw filesystem paths.
- Keep CSS split by concern under `static/css/`; avoid inline sprawl for large features.
- Do not commit downloaded vendor files; let startup fetch restore them.
