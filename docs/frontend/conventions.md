# Frontend conventions

## Source of truth

- Entry: `frontend/src/main.ts`
- Router: `frontend/src/router.ts`
- HTTP helpers: `frontend/src/api.ts`
- App shell: `frontend/src/components/App.vue`
- Client stores: `frontend/src/stores/`
- Frontend package pins: `frontend/package.json`
- HTML shell: `frontend/index.html`
- PWA registration: `frontend/src/pwa.ts`; SW generation: `src/musicweb/pwa_shell.py` + `routes/pwa.py` (see `docs/systems/pwa.md`)

## Architecture

- **Vite + `@vitejs/plugin-vue` + `vue-tsc`.** Vue and Vue Router are package deps. Components are `<script setup lang="ts">` SFCs; other modules are TypeScript. Imports use the `@/` alias (`frontend/src/`), a `.vue` suffix for SFCs, and extensionless TypeScript specifiers. Dev is `pnpm --dir frontend dev` (proxies `/api` to FastAPI `:8765`). Production is `pnpm --dir frontend build` (`vue-tsc` then Vite); FastAPI serves `frontend/dist` and replaces the `#musicweb-config` script body. SW registration skips when `import.meta.env.DEV`.
- **SPA fallback:** FastAPI serves the same shell for client routes so refresh works on `/folders`, `/artists/…`, etc.
- **Stores** hold player, playlist/queue, settings, and UI chrome. Components should prefer store APIs over ad-hoc globals. The player store is a facade: `player` record in `playerState.ts`, covers/Media Session metadata in `playerSession.ts`, volume/expanded keys in `playerPrefs.ts`. Loaders (`playHtml` / `playExclusive` / `playIndex`) stay in `player.ts`, which re-exports `player` only.
- **Library UI** lives under `components/library/`; player under `components/player/`; settings modal under `components/settings/`.
- **Row action menus** live under `components/menu/` (`ActionCard`, `AnchoredMenu`, thin `ActionMenu` picker). Callers own open/anchor state and pass items with `run()`. Do not add `stores/actionMenu.ts`. Do not add an `actions` mode to `dialog.ts`. A second surface mounts its own picker; do not invent a second overlay system.
- **Downloads** (`frontend/src/downloads/`) own client-side offline catalog (OPFS + IndexedDB). Keep offline concerns out of server index code. Design, storage split, queue policy, and import-surface rules: `docs/systems/downloads.md`.
- **Playback / quality** (play source, stream vs download policy, prepare): `docs/systems/playback.md`.
- **Exclusive audio** (Mac PWA + companion sinks; optional): `docs/systems/exclusive-audio.md`. Player transport goes through sinks — do not re-export a shared `HTMLAudioElement` from `player.ts`.
- **Connectivity** (online / offline / server_down, network cost hints): `docs/systems/connectivity.md`.
- **Diagnostics** (`frontend/src/diag/`): always-on emit with an Errors only / Everything cutoff in Settings. Same-origin `/api` fetches share the helper in `api.ts`. Design: `docs/systems/diagnostics.md`.

## Frontend package

Pinned Vue/Router and toolchain versions live only in `frontend/package.json`. Commit `frontend/pnpm-lock.yaml`. Do not commit `frontend/dist`.

To upgrade Vue/Router: change the version in `frontend/package.json`, run `pnpm --dir frontend install`, and rebuild.

## UX conventions

- Mobile: bottom tab bar + mini-player / expanded now-playing. The inactive pane is `.hidden` on the `.view` root (`#view-library` / `#view-playlist` in `LibraryView.vue` / `PlaylistView.vue`). `LibraryView` must stay a single root so `App.vue`’s fallthrough `class` lands on `#view-library`. Desktop (`min-width: 900px` in `layout.ts` / `desktop.css`) forces `.view.hidden` visible and hides `#tab-bar`.
- **Browse mode chips** (`ModeBar.vue`, `frontend/css/library.css`): one labeled row, horizontal scroll, no wrap, do not shrink below the label. Selected id is `useLibraryLocation()` (last library on `/queue`), via `effectiveLibraryMode` in `browseMode.ts` — not raw `route.meta.mode`.
- **Queue view-bar:** icon-only actions below 900px; labeled pills at/above. Glyphs live in the `frontend/index.html` sprite.
- Desktop: two-pane library + playlist with persistent player bar (breakpoint owned by CSS).
- Codec list in settings reflects **probed** browser decode support (`codecSupport.ts` / related probes), not a static marketing list alone — see `docs/systems/playback.md`.
- **Tracks and albums** normalize at the API boundary (`models/track.ts`, `models/album.ts`). Those leaves use camelCase — including album `lossyKind`. Artist, folder, and browse leaves keep today’s server field names (`album_count`, `track_count`, browse `dirs`/`files`). Do not add new runtime mappers for those surfaces.
- **Lossy marks:** `LossyMark` is a button (hover `title`, `aria-label`, tap → `showToast`). Do not nest it inside another `<button>`. Icon tap must not play, expand, or navigate. No long-press. Copy lives in `lossyKind.ts`.
- **No native browser dialogs.** Use `confirmDialog` / `promptDialog` from `stores/dialog.ts` (themed via `AppDialog`) for blocking confirm/prompt flows, and `showToast` from `stores/ui.ts` for transient errors and soft info. Do not call `alert`, `confirm`, or `prompt`.
- **Action-menu chrome** follows `(min-width: 900px)` via `layout.ts` (`DESKTOP_MEDIA`, `useDesktopViewport()`): centered card below, anchored dropdown at/above. Same breakpoint as the dual-pane shell. New client code does not copy the query string. Close the menu before `confirmDialog` / `promptDialog` (picker closes, then `run()`). The card acquires modal-lock token `"action-menu"`; the desktop dropdown does not. Queue rows: overflow button + desktop `contextmenu` (no native browser menu; no long-press unless product revisits it). The caller closes on route change and when Edit is entered; the picker does not import the router.
- **Artist photo menu** is on artists list (`⋯` replaces chevron), grid (desktop right-click only), and tree (`⋯` plus plus). Search rows, downloads library, the artist album-grid page, queue, and now-playing do not get a photo menu. Cropper chrome is `artistArt/cropper.ts` + `ImageCropper` in `App.vue` + `cropper.css`; system back copies Vue Router `history.state` and never changes path. Overlay lives in `artistArt/state.ts` (`pending` is `"upload" | "revert"`). HTTP success goes through `applyPreferredServerResult`. Helpers throw `PreferredRequestError` with `.status` via exported `apiFetch`. Modules `upload.ts` / `submit.ts` / `pending.ts` stay acyclic. `artistImageUrl` appends `&rev=` on any nonzero `preferred_rev`. Pending boot is `initArtistArtPending()` from `main.ts`; pending rows live in `musicweb-artist-art`, not downloads IDB.
- **Modal scroll lock:** `stores/modalLock.ts` acquire/release tokens only — settings, downloads manager, dialog, and the action-menu card must not toggle `body.modal-open` directly.
- **Interactive downloads:** user-facing `downloadTrack(s)` and `confirmRemoveDownloadedTrack` live in `downloads/ui.ts` (near-quota / remove confirms). Pure enqueue / lifecycle stay in `downloads/index.ts` (no dialog imports). Download **kind** join (`downloads/actionKind.ts`) returns `{ kind }` only; icon titles, glyphs, disabled, and menu labels stay with their callers. Details: `docs/systems/downloads.md`.

## Guardrails

- Do not revert to a CDN import map without a new decision (see technical decisions).
- Prefer stable track IDs in client state and playlist APIs over raw filesystem paths.
- Keep CSS split by concern under `frontend/css/`; avoid inline sprawl for large features.
- Do not commit `frontend/dist`; hosts build it with `pnpm --dir frontend build`.
