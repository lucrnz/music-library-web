**Archive.** Decisions in this file were current as of 2026-08-16 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Vite + pnpm + Vitest browser (initial cutover)

## Goal

Move the Vue SPA off no-bundler ESM / `vendor_deps.py` and onto a `frontend/` pnpm package: Vite for dev and production builds, FastAPI serving `frontend/dist`, and one Chromium smoke test in Vitest browser mode. The running app and that smoke test are the success bar.

## Settled decisions

- **Full cutover.** Vite owns the SPA. `pnpm --dir frontend dev` is the HMR loop (proxies `/api` to FastAPI `:8765`). `pnpm --dir frontend build` writes `frontend/dist`. `uv run musicweb` serves that dist. `vendor_deps.py`, the import map, and unpkg downloads go away.
- **Do not commit `frontend/dist`.** `create_app` fails before any `StaticFiles` mount if `frontend/dist/index.html` is missing. `musicweb doctor` fails the same way (hosts must have a built SPA).
- **Keep plain JS render-function modules.** No `.vue` SFCs, no TypeScript, in this plan.
- **Package lives only under `frontend/`.** No root `package.json` / pnpm workspace. Commands are `pnpm --dir frontend install|dev|build|test`.
- **Vite `base: '/'`.** Hashed JS/CSS at `/assets/…`. Images stay at `/static/img/…` via `frontend/public/static/img/` so placeholder URLs and manifest icons do not change.
- **Valid HTML defaults, no sentinels, no `transformIndexHtml`.** `frontend/index.html` has `theme-color` `#121212` and `<script type="application/json" id="musicweb-config">{"publicOrigin":""}</script>`. Vite-dev uses that as-is. FastAPI, per request, replaces that script body’s text with `json.dumps({"publicOrigin": ...})` using today’s `pub.origin and pub.secure` rule. `pwa.js` keeps the sync `#musicweb-config` read.
- **PWA must still work on the FastAPI origin.** `/sw.js` stays Python-generated (no Workbox). Inventory walks `frontend/dist`. Cache-first is `Set(PRECACHE_URLS)` membership only. Fingerprint path is `dist_dir / url.lstrip("/")` (no `/static/` prefix strip). `/manifest.webmanifest` stays `networkFirstManifest` (network first, offline cache or 503). Do not add it to `PRECACHE_URLS` — it is Python-generated, not a dist file.
- **Skip SW registration when `import.meta.env.DEV`.** `:5173` and `:8765` are different origins; a leftover worker on one cannot control the other. DEV skip is so Vite-dev does not register `/sw.js` on 5173.
- **Smoke test:** mount existing `Icon` in real Chromium DOM with a fixture `<symbol id="i-play">` and assert `use[href="#i-play"]`. `let app` in describe-scope; unmount in `afterEach`.
- **Vue 3.5.18 and vue-router 4.5.1** stay pinned. Vite / Vitest / `@vitest/browser-playwright`: pin whatever compatible stable set is current at implement time in `frontend/package.json` **and** commit `pnpm-lock.yaml`. Do not target a named Vitest major in prose.
- **One Vue alias.** `vite.config.js` aliases `vue` → `vue/dist/vue.esm-bundler.js` and defines `__VUE_OPTIONS_API__: true`, `__VUE_PROD_DEVTOOLS__: false`, `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false`. `vitest.config.js` `mergeConfig`s that file and only adds `test.browser`.
- **Default Vite app bundle** (hashed chunks), not `preserveModules`.
- **Stage shape:** copy the SPA into `frontend/` (old tree stays until cutover). Merge FastAPI-serve + PWA inventory + vendor/Jinja deletion into one cutover stage. Doctor grows an unconditional dist-exists **fail**.
- **`frontend_dist_dir()` lives on `pwa_shell.py`:** `PACKAGE_DIR.parent.parent / "frontend" / "dist"` (`PACKAGE_DIR` there is already `src/musicweb`). Lifespan, `create_app`, `pages.py`, inventory, and doctor import it. Never recompute `parents[N]` in `routes/`. Do not put the helper on `main.py` (cycle) or `config.py` (no new public config surface).

## Design

The Python package stops being the frontend source tree. `frontend/` is the Vite app; FastAPI becomes API + PWA generator + dist host.

```
frontend/
  package.json          # only Node package
  pnpm-lock.yaml
  vite.config.js
  vitest.config.js      # mergeConfig(viteConfig, { test.browser })
  index.html            # sprite + valid defaults + ./js/main.js + ./css/*.css
  js/                   # copy of src/musicweb/static/js (relative imports unchanged)
  css/                  # copy of src/musicweb/static/css
  public/static/img/    # copy of src/musicweb/static/img → URLs /static/img/…
  tests/icon.smoke.test.js
  dist/                 # gitignored build output
```

**Dev loop (after stage 02, until cutover).** Two processes: `uv run musicweb` still serves the **no-bundler** SPA on `:8765`; `pnpm --dir frontend dev` serves the Vite copy on `:5173`. Vite proxies `/api` to `http://127.0.0.1:8765` with `timeout: 0` (ranged `/api/stream` must not buffer out). SW does not register on `:5173`.

**Prod loop (after stage 04).** `pnpm --dir frontend build` then `uv run musicweb`. Browse `:8765`. `create_app` refuses to build the ASGI app without `frontend/dist/index.html` (Starlette `StaticFiles` would otherwise raise a generic missing-dir error first). FastAPI:

- reads `dist/index.html` **per request** and replaces the `#musicweb-config` script body
- mounts `dist/assets` at `/assets` and `dist/static` at `/static` only when those paths are directories
- reserves `assets/` (and existing `api/`, `static/`) from the SPA fallback
- generates `/sw.js` by walking `frontend/dist` (skip `index.html`; shell URL is `/` only)

**PWA.** `sw.template.js` moves to `src/musicweb/sw.template.js`. Drop `_SHELL_SUBDIRS`. Walk the whole dist tree; skip `index.html`, `.map`, `.template.`, `~`, and any file whose **any path part** starts with `.` (so `dist/.vite/manifest.json` is not precached). Public URL = `/` + posix relpath. Fingerprint hashes template + URLs + `mtime_ns:size` of `dist_dir / url.lstrip("/")` (or `missing`). Worker builds `Set(PRECACHE_URLS)` at top. Fetch order: `/api/*` and `/sw.js` `shouldBypass`; `/manifest.webmanifest` stays `networkFirstManifest` and is **not** in `PRECACHE_URLS`; navigations stay network-first with offline `/`; cache-first iff the request URL’s pathname is in `PRECACHE` (pathnames only, no search, in both Python and the worker). Manifest icon `src` values stay `/static/img/icon-*.png`. Copy existing PNGs with the img tree; do not generate icons.

**Tests.** Vitest browser mode, Playwright provider, Chromium only, headless. `pnpm --dir frontend test` is `vitest run`. One-time `pnpm --dir frontend exec playwright install chromium`. No coverage reporter.

## Stage map

1. **Scaffold** the `frontend/` package (stub app, `mergeConfig`, lockfile). FastAPI untouched. Independently shippable.
2. **Copy** js/css/img + real `index.html` into `frontend/`, streaming-safe proxy, DEV skip on the **copy** of `pwa.js` only. `:8765` still serves the no-bundler tree. `:5173` is the new UI. Independently shippable.
3. **Smoke test** mounts `Icon` in Chromium. Depends on 02. Does not need FastAPI to serve dist.
4. **One cutover:** FastAPI hosts dist, inventory/fingerprint/SW rewritten, `vendor_deps` / Jinja / old `static/` SPA deleted, `jinja2` dropped from `pyproject.toml` then `uv lock`, doctor fail on missing dist. After this, `:8765` UI **and** PWA both work. Depends on 02.
5. **Living docs + ADR.** Last.

03 and 04 are independent of each other after 02; 03 first because it is smaller and proves Vue/Vitest before the production switch.

## Out of scope

- TypeScript
- ESLint, Prettier, or other linters/formatters
- Real test coverage (one smoke test only)
- `.vue` SFC conversion
- Root pnpm workspace / root `package.json`
- Committing `frontend/dist`
- Workbox or any Node-built service worker
- GitHub Actions / CI
- Firefox / WebKit Vitest instances
- Generating PWA PNG icons
- `transformIndexHtml` / `__THEME_COLOR__` / `__MUSICWEB_CONFIG__` sentinels
- Changing `config.py`’s public settings surface

## Assumptions

- Implementer has Node 20+ and pnpm available; Python/uv workflow is unchanged.
- Operators of this checkout will run `pnpm --dir frontend build` before `uv run musicweb` or a green `musicweb doctor`. There is no published wheel that must embed the SPA; dist is `src/musicweb` → `PACKAGE_DIR.parent.parent / "frontend" / "dist"`.
- FastAPI listen port stays **8765** for the Vite proxy default.
- `pwa.js` is the only reader of `#musicweb-config`.
- `THEME_COLOR` / `BACKGROUND_COLOR` stay `#121212` (already duplicated in CSS `--bg`). HTML meta uses that literal; Python still owns the manifest constants.
- Downloads `worker.js` is a normal ESM module (`import()`), not `new Worker(...)`. Default Vite bundling is enough.
- No GitHub Actions directory exists; documenting the test command is sufficient.
- Relative imports inside `static/js/**` already use `.js` suffixes and survive a directory-preserving **copy**.
- `src/musicweb/cli/doctor.py` has no frontend/vendor check today. Stage 04 adds the first one.
- `src/musicweb/static/img/` already contains `favicon.svg`, `placeholder.svg`, and `icon-*.png`. Copy them; do not create new image files.
- `jinja2` is listed in `pyproject.toml` only for the SPA template. After Jinja is gone it is unused; `uv lock` must drop it from `uv.lock` too.
- Stream-proxy verify needs at least one indexed track. Pick the id from `GET /api/browse` only.
- Root `.gitignore` already has `dist/` (matches `frontend/dist/`). Still add explicit `frontend/` artifact lines.
