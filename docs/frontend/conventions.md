# Frontend conventions

## Source of truth

- Entry: `src/musicweb/static/js/main.js`
- Router: `src/musicweb/static/js/router.js`
- HTTP helpers: `src/musicweb/static/js/api.js`
- App shell: `src/musicweb/static/js/components/App.js`
- Client stores: `src/musicweb/static/js/stores/`
- Vendor pin registry: `src/musicweb/vendor_deps.py`
- HTML shell + import map: `src/musicweb/templates/index.html`
- PWA registration: `src/musicweb/static/js/pwa.js`; SW generation: `src/musicweb/pwa_shell.py` + `routes/pwa.py` (see `docs/systems/pwa.md`)

## Architecture

- **No bundler / no Node.** Browser loads Vue and Vue Router as ESM from `/static/vendor/` via import map.
- **SPA fallback:** FastAPI serves the same shell for client routes so refresh works on `/folders`, `/artists/…`, etc.
- **Stores** hold player, playlist/queue, settings, and UI chrome. Components should prefer store APIs over ad-hoc globals.
- **Library UI** lives under `components/library/`; player under `components/player/`; settings modal under `components/settings/`.
- **Downloads** (`static/js/downloads/`) own client-side offline catalog (OPFS + IndexedDB). Keep offline concerns out of server index code. Design, storage split, queue policy, and import-surface rules: `docs/systems/downloads.md`.
- **Playback / quality** (play source, stream vs download policy, prepare): `docs/systems/playback.md`.
- **Connectivity** (online / offline / server_down, network cost hints): `docs/systems/connectivity.md`.

## Vendor assets

Pinned package versions and CDN URLs live only in `vendor_deps.py`. On startup, missing or version-mismatched files are downloaded into `static/vendor/` and recorded in a local manifest. `static/vendor/**` is gitignored except a keep file.

To upgrade Vue/Router: change version + URL in `vendor_deps.py` and restart with network available.

## UX conventions

- Mobile: bottom tab bar + mini-player / expanded now-playing.
- Desktop: two-pane library + playlist with persistent player bar (breakpoint owned by CSS).
- Codec list in settings reflects **probed** browser decode support (`codecSupport.js` / related probes), not a static marketing list alone — see `docs/systems/playback.md`.
- **No native browser dialogs.** Use `confirmDialog` / `promptDialog` from `stores/dialog.js` (themed via `AppDialog`) for blocking confirm/prompt flows, and `showToast` from `stores/ui.js` for transient errors and soft info. Do not call `alert`, `confirm`, or `prompt`.
- **Modal scroll lock:** `stores/modalLock.js` acquire/release tokens only — settings, downloads manager, and dialog must not toggle `body.modal-open` directly.
- **Interactive downloads:** user-facing `downloadTrack(s)` live in `downloads/ui.js` (near-quota confirm). Pure enqueue / lifecycle stay in `downloads/index.js` (no dialog imports). Details: `docs/systems/downloads.md`.

## Guardrails

- Do not introduce a Vite/webpack/npm app shell without an explicit decision (see technical decisions).
- Prefer stable track IDs in client state and playlist APIs over raw filesystem paths.
- Keep CSS split by concern under `static/css/`; avoid inline sprawl for large features.
- Do not commit downloaded vendor files; let startup fetch restore them.
