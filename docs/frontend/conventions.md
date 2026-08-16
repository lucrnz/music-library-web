# Frontend conventions

## Source of truth

- Entry: `frontend/js/main.js`
- Router: `frontend/js/router.js`
- HTTP helpers: `frontend/js/api.js`
- App shell: `frontend/js/components/App.js`
- Client stores: `frontend/js/stores/`
- Frontend package pins: `frontend/package.json`
- HTML shell: `frontend/index.html`
- PWA registration: `frontend/js/pwa.js`; SW generation: `src/musicweb/pwa_shell.py` + `routes/pwa.py` (see `docs/systems/pwa.md`)

## Architecture

- **Vite ESM + pnpm.** Vue and Vue Router are package deps. Dev is `pnpm --dir frontend dev` (proxies `/api` to FastAPI `:8765`). Production is `pnpm --dir frontend build`; FastAPI serves `frontend/dist` and replaces the `#musicweb-config` script body. SW registration skips when `import.meta.env.DEV`.
- **SPA fallback:** FastAPI serves the same shell for client routes so refresh works on `/folders`, `/artists/…`, etc.
- **Stores** hold player, playlist/queue, settings, and UI chrome. Components should prefer store APIs over ad-hoc globals. The player store is a facade: `player` record in `playerState.js`, covers/Media Session metadata in `playerSession.js`, volume/expanded keys in `playerPrefs.js`. Loaders (`playHtml` / `playExclusive` / `playIndex`) stay in `player.js`, which re-exports `player` only.
- **Library UI** lives under `components/library/`; player under `components/player/`; settings modal under `components/settings/`.
- **Row action menus** live under `components/menu/` (`ActionCard`, `AnchoredMenu`, thin `ActionMenu` picker). Callers own open/anchor state and pass items with `run()`. Do not add `stores/actionMenu.js`. Do not add an `actions` mode to `dialog.js`. A second surface mounts its own picker; do not invent a second overlay system.
- **Downloads** (`frontend/js/downloads/`) own client-side offline catalog (OPFS + IndexedDB). Keep offline concerns out of server index code. Design, storage split, queue policy, and import-surface rules: `docs/systems/downloads.md`.
- **Playback / quality** (play source, stream vs download policy, prepare): `docs/systems/playback.md`.
- **Exclusive audio** (Mac PWA + companion sinks; optional): `docs/systems/exclusive-audio.md`. Player transport goes through sinks — do not re-export a shared `HTMLAudioElement` from `player.js`.
- **Connectivity** (online / offline / server_down, network cost hints): `docs/systems/connectivity.md`.
- **Diagnostics** (`frontend/js/diag/`): always-on emit with an Errors only / Everything cutoff in Settings. Same-origin `/api` fetches share the helper in `api.js`. Design: `docs/systems/diagnostics.md`.

## Frontend package

Pinned Vue/Router and toolchain versions live only in `frontend/package.json`. Commit `frontend/pnpm-lock.yaml`. Do not commit `frontend/dist`.

To upgrade Vue/Router: change the version in `frontend/package.json`, run `pnpm --dir frontend install`, and rebuild.

## UX conventions

- Mobile: bottom tab bar + mini-player / expanded now-playing.
- Desktop: two-pane library + playlist with persistent player bar (breakpoint owned by CSS).
- Codec list in settings reflects **probed** browser decode support (`codecSupport.js` / related probes), not a static marketing list alone — see `docs/systems/playback.md`.
- **Tracks and albums** normalize at the API boundary (`models/track.js`, `models/album.js`). Leaf UI uses camelCase only — including album `lossyKind`.
- **Lossy marks:** `LossyMark` is a button (hover `title`, `aria-label`, tap → `showToast`). Do not nest it inside another `<button>`. Icon tap must not play, expand, or navigate. No long-press. Copy lives in `lossyKind.js`.
- **No native browser dialogs.** Use `confirmDialog` / `promptDialog` from `stores/dialog.js` (themed via `AppDialog`) for blocking confirm/prompt flows, and `showToast` from `stores/ui.js` for transient errors and soft info. Do not call `alert`, `confirm`, or `prompt`.
- **Action-menu chrome** follows `(min-width: 900px)` via `layout.js` (`DESKTOP_MEDIA`, `useDesktopViewport()`): centered card below, anchored dropdown at/above. Same breakpoint as the dual-pane shell. New JS does not copy the query string. Close the menu before `confirmDialog` / `promptDialog` (picker closes, then `run()`). The card acquires modal-lock token `"action-menu"`; the desktop dropdown does not. Queue rows: overflow button + desktop `contextmenu` (no native browser menu; no long-press unless product revisits it). The caller closes on route change and when Edit is entered; the picker does not import the router.
- **Modal scroll lock:** `stores/modalLock.js` acquire/release tokens only — settings, downloads manager, dialog, and the action-menu card must not toggle `body.modal-open` directly.
- **Interactive downloads:** user-facing `downloadTrack(s)` and `confirmRemoveDownloadedTrack` live in `downloads/ui.js` (near-quota / remove confirms). Pure enqueue / lifecycle stay in `downloads/index.js` (no dialog imports). Download **kind** join (`downloads/actionKind.js`) returns `{ kind }` only; icon titles, glyphs, disabled, and menu labels stay with their callers. Details: `docs/systems/downloads.md`.

## Guardrails

- Do not revert to a CDN import map without a new decision (see technical decisions).
- Prefer stable track IDs in client state and playlist APIs over raw filesystem paths.
- Keep CSS split by concern under `frontend/css/`; avoid inline sprawl for large features.
- Do not commit `frontend/dist`; hosts build it with `pnpm --dir frontend build`.
