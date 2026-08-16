# Stage 04: FastAPI serves dist and PWA walks it

## Status
done

## Description

One production switch: FastAPI hosts `frontend/dist` (config script replace, `/assets` + `/static` mounts), PWA inventory/fingerprint/SW use that dist, `vendor_deps` / Jinja / old `static/` SPA go away, `jinja2` leaves `pyproject.toml` and `uv.lock`, and `musicweb doctor` fails if dist is missing. After this stage, `pnpm --dir frontend build && uv run musicweb` has a working UI **and** a working shell SW.

## Rationale

Reviews rejected a FastAPI-only cutover that left PWA walking a deleted `static/` tree. One shippable switch: the operator entrypoint and the installable shell change together.

## Invariants

- `/api/*` behavior unchanged (including ranged `/api/stream`).
- SPA fallback still serves the same shell for `/folders`, `/artists/…`, etc.
- `#musicweb-config` remains a JSON script tag; `pwa.js` keeps its sync read. DEV skip still applies only under Vite.
- `frontend/dist` is not committed.
- Images remain at `/static/img/…`.
- SW is still generated in Python on `GET /sw.js`. No Workbox. Install is still fail-closed. `/api/*` and `/sw.js` are still network-only. `/manifest.webmanifest` stays `networkFirstManifest` and is not in `PRECACHE_URLS`. Navigations stay network-first with offline `/`.
- Manifest icon paths remain `/static/img/icon-*.png`.
- `MUSICWEB_PUBLIC_ORIGIN` / page-origin skip in `pwa.js` unchanged (plus DEV skip from stage 02).
- Dist path is resolved only via `pwa_shell.frontend_dist_dir()`.

## Risks

- Mounting all of `dist/` at `/` would swallow `/api`. Mount only `/assets` and `/static`.
- Forgetting to reserve `assets/` on the SPA catch-all returns HTML for hashed JS.
- `StaticFiles(..., check_dir=True)` runs at `create_app` time, **before** lifespan. A missing `dist/assets` raises Starlette’s generic error unless `create_app` checks first.
- Putting `frontend_dist_dir` on `main.py` cycles (`main` imports `pages` / `pwa`). Putting `parents[2]` in `routes/pages.py` resolves to `src/frontend/dist`. Owner is `pwa_shell.py`.
- Leaving `_inventory_fingerprint`’s `url.startswith("/static/")` strip makes `/assets/*` skip mtime and `/static/img/…` hash as `missing`.
- Prefix cache-first (`/assets/` or `/static/`) would cache non-inventory files. Membership only.
- Baking `index.html` at process start serves a dead hashed shell after `pnpm build` without restart. Read the file per request.

## Implementation

### Files

- Change `src/musicweb/pwa_shell.py` (`frontend_dist_dir`, inventory walk, fingerprint mapper, template path)
- Change `src/musicweb/main.py` (`create_app` check + mounts; lifespan banner; drop `ensure_vendor_assets`)
- Change `src/musicweb/routes/pages.py` (read dist HTML, replace config script body, drop Jinja, reserve `assets/`)
- Change `src/musicweb/static/sw.template.js` then move to `src/musicweb/sw.template.js`
- Change `src/musicweb/routes/pwa.py` only if it hardcodes the old static path (manifest icon `src` values stay)
- Change `src/musicweb/cli/doctor.py` (unconditional dist-exists fail)
- Change `pyproject.toml` (remove `jinja2`) then `uv.lock` (`uv lock`)
- Change `.gitignore` (remove vendor fetch rules)
- Delete `src/musicweb/vendor_deps.py` and all imports
- Delete `src/musicweb/templates/index.html` (remove `templates/` if empty)
- Delete `src/musicweb/static/js/`, `static/css/`, `static/img/`, `static/vendor/` after the new mounts work
- Delete `src/musicweb/static/` if empty

### Steps

1. On `pwa_shell.py` add:
   ```python
   def frontend_dist_dir() -> Path:
       return PACKAGE_DIR.parent.parent / "frontend" / "dist"
   ```
   Add `require_frontend_dist() -> Path` that returns that dir if `index.html` is a file, else raises `RuntimeError` naming `pnpm --dir frontend build`. Repeat on the cutover stage next to the helper: there is no wheel; this is checkout-root resolution.

2. `create_app`: call `require_frontend_dist()` **before** any `StaticFiles` mount. Remove `StaticFiles` on `PACKAGE_DIR / "static"`. Mount `dist/assets` at `/assets` and `dist/static` at `/static` (`html=False`) **only if those paths are directories**. Lifespan: drop `ensure_vendor_assets()`; print `frontend: dist`. Do not download anything.

3. `pages.py`: drop `Jinja2Templates`. Per request, read `require_frontend_dist() / "index.html"`. Replace the exact substring
   `<script type="application/json" id="musicweb-config">{"publicOrigin":""}</script>`
   with the same tag whose body is `json.dumps({"publicOrigin": public_origin})`, using the same `pub.origin and pub.secure` rule as today’s `_spa_context`. Do not replace theme-color. If the exact empty-origin tag is missing, raise `RuntimeError` (stale or hand-edited dist). Serve that string for `/` and the catch-all. Add `assets/` to `_SPA_RESERVED_PREFIXES`. Keep `sw.js` and `manifest.webmanifest` reserved.

4. Inventory: drop `_SHELL_SUBDIRS` and `STATIC_DIR` as a `/static/`-shaped name. Walk `frontend_dist_dir()` entire tree. Skip `index.html`, `.map`, `.template.`, `~`, and any file whose **any path part** starts with `.` (filename **or** a parent like `.vite`). URL = `/` + posix relative path (`dist/assets/foo.js` → `/assets/foo.js`, `dist/static/img/x.png` → `/static/img/x.png`). `shell_precache_urls` is `["/"] +` those URLs.

5. `_inventory_fingerprint`: for every URL except `/`, `path = root / url.lstrip("/")`; hash `mtime_ns:size` or `missing`. Delete the `url.startswith("/static/")` branch. Rename helpers so they say dist, not static-subdir.

6. `sw.template.js`: at top, `const PRECACHE = new Set(PRECACHE_URLS)`. Fetch order: `/api/*` and `/sw.js` still `shouldBypass`; **keep** `networkFirstManifest` for `/manifest.webmanifest` (do **not** add that URL to `PRECACHE_URLS`); navigations stay network-first with offline `/`; cache-first iff `url.pathname` is in `PRECACHE` (precache URLs are path-only today — **pathnames only**, no search, in both Python and the worker). Move the file to `src/musicweb/sw.template.js`. Point `SW_TEMPLATE_PATH` at it.

7. Manifest in `routes/pwa.py`: leave icon `src` as `/static/img/icon-*.png`. Do not generate PNGs.

8. `doctor.py`: after the existing checks, if `frontend_dist_dir() / "index.html"` is missing, print `FAIL frontend dist missing; run: pnpm --dir frontend build` and set `ok = False`. Same string family as `require_frontend_dist`. Do not call `create_app`. Do not warn-and-continue.

9. Delete `vendor_deps.py` and imports, Jinja `index.html`, leftover `static/js|css|img|vendor`, empty dirs. Remove vendor lines from `.gitignore`. Remove `jinja2>=3.1.6` from `pyproject.toml`, then run `uv lock` so `uv.lock` no longer installs Jinja.

### Verify

- `pnpm --dir frontend build && uv run --group dev pytest` — existing Python tests still pass (none import `vendor_deps`).
- `rg "vendor_deps|ensure_vendor|Jinja2Templates|unpkg.com" src/musicweb` — no matches.
- `rg "jinja2" pyproject.toml uv.lock` — no match.
- `rg "frontend_dist_dir|require_frontend_dist" src/musicweb/pwa_shell.py src/musicweb/main.py src/musicweb/routes/pages.py src/musicweb/cli/doctor.py` — helper defined in `pwa_shell.py`; others import it.
- `rg "parents\\[2\\]" src/musicweb/routes` — no match.
- `rg "startswith\\(\\"/static/\\"\\)" src/musicweb` — no inventory or SW fetch-handler prefix test.
- `rg "_SHELL_SUBDIRS|static/vendor" src/musicweb/pwa_shell.py` — gone.
- Start with dist renamed away: `create_app` / `uv run musicweb` exits with a message that names `pnpm --dir frontend build` (not Starlette’s missing-directory error).
- `uv run musicweb doctor` with dist missing: prints that FAIL line and exits 1. With dist present: no frontend FAIL.
- With dist: `GET /` HTML contains `"publicOrigin"` (not sentinels) and a `/assets/` script src. `GET /assets/<built-js>` is 200. `GET /static/img/placeholder.svg` is 200. `GET /folders` is the same shell. `GET /api/health` is JSON.
- `GET /sw.js`: body contains `/assets/` and `"/"` and `/static/img/placeholder.svg` and `networkFirstManifest`; does **not** contain `/static/js/main.js` or `vendor/vue`. Does **not** list `/manifest.webmanifest` inside the injected `PRECACHE_URLS` array.
- With dist + an indexed track: pick an id from `GET /api/browse` and `curl -sS -D - -o /dev/null -H "Range: bytes=0-1023" "http://127.0.0.1:8765/api/stream?id=<track_id>"` is **206**.
- Manual on `http://localhost:8765` (loopback secure context): SW registers; Cache Storage `musicweb-*` holds hashed `/assets/` files; DevTools offline + reload still shows the shell; `/api/health` is not in that cache.
- Vite-dev from stage 02 still works (`pnpm --dir frontend dev` + API on `:8765`).

## Acceptance

- [ ] `pnpm --dir frontend build` then `uv run musicweb` shows the real app at `http://localhost:8765/` (browse + `/api` + ranged stream **206**).
- [ ] Missing dist fails `create_app` **and** `musicweb doctor` with the pnpm build message.
- [ ] `/sw.js` precaches hashed `/assets/` + `/` + `/static/img/…`; install is fail-closed; `/api` is not SW-cached.
- [ ] `vendor_deps.py`, Jinja template, `jinja2` in `pyproject.toml` **and** `uv.lock`, and `src/musicweb/static/` SPA sources are gone.
- [ ] `/sw.js` still has `networkFirstManifest` for `/manifest.webmanifest`; that URL is not in `PRECACHE_URLS`.
- [ ] No `/static/` prefix logic remains in inventory or the worker. Dist path has one owner: `pwa_shell.py`.
