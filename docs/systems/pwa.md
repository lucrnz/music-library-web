# Progressive Web App (shell)

## Overview

Installable app shell and offline **bootstrap** for the Vue SPA. Offline **audio** remains Downloads (OPFS on Android / leftover, companion disk on an installed desktop PWA), not the service worker.

## Source of truth

- Public origin setting: `src/musicweb/config.py` (`MUSICWEB_PUBLIC_ORIGIN` → `PublicOrigin`)
- Env roles / secure context: `docs/development/environment.md`
- Shell inventory + SW generation + theme/background chrome constants: `src/musicweb/pwa_shell.py`
- SW logic template: `src/musicweb/sw.template.js` (not served directly)
- Manifest + `/sw.js` routes: `src/musicweb/routes/pwa.py`
- HTML shell: `frontend/index.html` (theme-color `#121212`; FastAPI replaces `#musicweb-config`)
- Registration: `frontend/src/pwa.ts` (skips when `import.meta.env.DEV`)
- Icons: `frontend/public/static/img/icon-*.png` (URLs stay `/static/img/…`)

## Decisions

### Shell-only service worker

The SW is **generated** on each `GET /sw.js`: Python walks `frontend/dist` and injects a complete `PRECACHE_URLS` list plus a content-derived cache version (fingerprint path is `dist / url.lstrip("/")`). Install is **fail-closed**: any inventory miss aborts install so the previous complete cache stays controlling. The worker **never** caches `/api/*` (including streams). Offline music stays under explicit user Downloads.

### Server-derived inventory

There is no hand-maintained module list. A new hashed file under `frontend/dist` is included on the next SW generation after `pnpm --dir frontend build`. Cache version changes when the template or asset mtimes/sizes change so clients quietly pick up a new shell. Cache-first is **precache membership** (`Set(PRECACHE_URLS)`), not a `/static/` or `/assets/` prefix.

### Admin-configured public origin

Operators set the canonical browser origin via env. Settings expose a single `PublicOrigin` value (`raw`, `origin`, `secure`). Manifest `start_url` / `scope` / `id` use an absolute origin only when that value is parseable **and** a secure-context shape. Icons stay **relative**. The client registers the SW only when the page origin matches the configured origin (when set), so OPFS/cache are not split across LAN IP vs install URL.

**Host string must match exactly** — `http://localhost:8765` and `http://127.0.0.1:8765` are different origins. Configure the same host clients type in the address bar.

### Quiet updates

A new service worker activates without an in-app “reload” banner. Cache version is derived automatically; no manual `shell-vN` bump.

### Complements Downloads, does not replace it

Connectivity UX is quiet: transition toasts via the shell binder (`connectivityUi.js` at boot), plus a guidance banner only when Downloads are disabled. Offline **audio** is Downloads — see `docs/systems/downloads.md`. Reachability and network-cost signals: `docs/systems/connectivity.md`. The SW’s job is: **the app can open** when the host or tunnel is down.

## Request handling (intent)

| Class | Intent |
|-------|--------|
| Navigations (`request.mode === "navigate"`) | Network first; offline → cached shell at `/` |
| Precache membership (`PRECACHE_URLS`) | Cache-first (hashed `/assets/…`, `/static/img/…`, `/`; install aborts if any URL misses) |
| `/api/*` | Network only — never SW cache |
| `/sw.js` | Network only (always fresh worker script) |
| `/manifest.webmanifest` | Network first; offline cache or 503 (`networkFirstManifest`). Not on the precache list. |

## Guardrails

- Do not store audio or library API responses in the service worker cache.
- Do not activate a worker whose precache is incomplete; a miss must fail install.
- Do not register a SW when `MUSICWEB_PUBLIC_ORIGIN` is set and the page origin differs.
- Do not introduce a Node/Workbox build pipeline for the SW without an explicit project decision.
- Do not serve `sw.template.js` as the worker; only the generated `/sw.js` body is registered.
- Keep secure-context requirements documented next to the env var; do not claim LAN HTTP install works.
