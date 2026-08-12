# Progressive Web App (shell)

## Overview

Installable app shell and offline **bootstrap** for the Vue SPA. Offline **audio** remains the existing Downloads feature (OPFS + IndexedDB), not the service worker.

## Source of truth

- Public origin setting: `src/musicweb/config.py` (`MUSICWEB_PUBLIC_ORIGIN` → `PublicOrigin`)
- Env roles / secure context: `docs/development/environment.md`
- Shell inventory + SW generation + theme/background chrome constants: `src/musicweb/pwa_shell.py`
- SW logic template: `src/musicweb/static/sw.template.js` (not served directly)
- Manifest + `/sw.js` routes: `src/musicweb/routes/pwa.py`
- HTML shell: `src/musicweb/templates/index.html` (theme-color from shared `pwa_shell` constants)
- Registration: `src/musicweb/static/js/pwa.js`
- Icons: `src/musicweb/static/img/icon-*.png`

## Decisions

### Shell-only service worker

The SW is **generated** on each `GET /sw.js`: Python walks `static/{css,js,img,vendor}` and injects a complete `PRECACHE_URLS` list plus a content-derived cache version. The worker **never** caches `/api/*` (including streams). Offline music stays under explicit user Downloads.

### Server-derived inventory

There is no hand-maintained module list. Adding a file under `static/js/` (etc.) is included on the next SW generation. Cache version changes when the template or asset mtimes/sizes change so clients quietly pick up a new shell.

### Admin-configured public origin

Operators set the canonical browser origin via env. Settings expose a single `PublicOrigin` value (`raw`, `origin`, `secure`). Manifest `start_url` / `scope` / `id` use an absolute origin only when that value is parseable **and** a secure-context shape. Icons stay **relative**. The client registers the SW only when the page origin matches the configured origin (when set), so OPFS/cache are not split across LAN IP vs install URL.

**Host string must match exactly** — `http://localhost:8765` and `http://127.0.0.1:8765` are different origins. Configure the same host clients type in the address bar.

### Quiet updates

A new service worker activates without an in-app “reload” banner. Cache version is derived automatically; no manual `shell-vN` bump.

### Complements Downloads, does not replace it

Connectivity UX is quiet: transition toasts via the shell binder (`connectivityUi.js` at boot), plus a guidance banner only when Downloads are disabled. Offline **audio** is the Downloads system (OPFS + IndexedDB) — see `docs/systems/downloads.md`. Reachability and network-cost signals: `docs/systems/connectivity.md`. The SW’s job is: **the app can open** when the host or tunnel is down.

## Request handling (intent)

| Class | Intent |
|-------|--------|
| Navigations (`request.mode === "navigate"`) | Network first; offline → cached shell at `/` |
| `/static/*` | Cache-first (full inventory precached at install) |
| `/api/*` | Network only — never SW cache |
| `/sw.js` | Network only (always fresh worker script) |
| `/manifest.webmanifest` | Network first; offline cache or 503 Response |

## Guardrails

- Do not store audio or library API responses in the service worker cache.
- Do not register a SW when `MUSICWEB_PUBLIC_ORIGIN` is set and the page origin differs.
- Do not introduce a Node/Workbox build pipeline for the SW without an explicit project decision.
- Do not serve `sw.template.js` as the worker; only the generated `/sw.js` body is registered.
- Keep secure-context requirements documented next to the env var; do not claim LAN HTTP install works.
