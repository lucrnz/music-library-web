# Stage 01: Scaffold the frontend package

## Status
done

## Description

Create `frontend/` as a private pnpm package with Vite and Vitest browser (Playwright/Chromium) configs, a stub `index.html` + `js/main.js`, and gitignore rules. Do not copy or move the existing SPA. `uv run musicweb` keeps serving the no-bundler app.

## Rationale

Prove install/build/lockfile and the Vue full-build alias before touching 100+ JS files. If the toolchain is wrong, the copy stage is not the place to discover it.

## Invariants

- `src/musicweb/static/**`, `vendor_deps.py`, and `templates/index.html` are untouched.
- `uv run musicweb` still starts and serves the current SPA.
- No root `package.json` or `pnpm-workspace.yaml`.
- Vue alias is declared once (`vite.config.js`). Vitest only `mergeConfig`s.

## Risks

- Pinning Vite/Vitest too loosely can drift between machines. Record exact versions in `frontend/package.json` and commit `pnpm-lock.yaml` in this stage.
- Forgetting the Vue bundler alias here means stage 02 “works” on the stub and dies on the first `template:` component.
- Setting `__VUE_OPTIONS_API__` to `false` would break every `defineComponent({ template })`. It must be `true`.

## Implementation

### Files

- Create `frontend/package.json`
- Create `frontend/pnpm-lock.yaml` (via `pnpm install`)
- Create `frontend/vite.config.js`
- Create `frontend/vitest.config.js`
- Create `frontend/index.html` (stub)
- Create `frontend/js/main.js` (stub)
- Change `.gitignore` (add frontend artifacts; leave vendor rules until stage 04)

### Steps

1. `frontend/package.json`: `"private": true`, `"type": "module"`, name `musicweb-frontend`, `"packageManager"` set to the pnpm version used, `"engines": { "node": ">=20" }`. Dependencies: `vue@3.5.18`, `vue-router@4.5.1`. DevDependencies: pin the current compatible `vite`, `vitest`, and `@vitest/browser-playwright` (whatever set those packages document together **today** — write the exact versions into `package.json`; do not leave “latest” or a major-only range as the only pin). Scripts: `dev` → `vite`, `build` → `vite build`, `preview` → `vite preview`, `test` → `vitest run`.
2. `frontend/vite.config.js` (object export, not a function — `mergeConfig` in step 3 needs a plain object):
   - `base: '/'`, `build.outDir: 'dist'`, `build.emptyOutDir: true`
   - `resolve.alias.vue` → `vue/dist/vue.esm-bundler.js`
   - `define`: `__VUE_OPTIONS_API__: true`, `__VUE_PROD_DEVTOOLS__: false`, `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false`
   - `server.proxy['/api']`: `{ target: 'http://127.0.0.1:8765', timeout: 0 }` (stage 02 verifies stream; set the timeout now so 02 does not rewrite the proxy shape)
   - Do **not** set `test.browser` here
3. `frontend/vitest.config.js`: `mergeConfig` the Vite config and add only `test.browser` (`enabled: true`, `provider: playwright()` from `@vitest/browser-playwright`, `headless: true`, `instances: [{ browser: 'chromium' }]`) plus `test.include: ['tests/**/*.test.js']`. No coverage config. Do not repeat the Vue alias.
4. Stub `frontend/index.html`: `<div id="app"></div>` and `<script type="module" src="./js/main.js"></script>`. Stub `frontend/js/main.js`: `document.getElementById("app").textContent = "musicweb-frontend"`.
5. `.gitignore`: add `frontend/node_modules/`, `frontend/dist/`, `frontend/test-results/`, `frontend/playwright-report/`, `frontend/blob-report/`. Do not remove the `static/vendor` rules yet.
6. From repo root: `pnpm --dir frontend install`. Commit `frontend/pnpm-lock.yaml`.

### Verify

- `test -f frontend/package.json && test ! -f package.json` — only frontend package.
- `pnpm --dir frontend build` — exits 0; `frontend/dist/index.html` exists; `rg "musicweb-frontend" frontend/dist` matches.
- `rg "vue.esm-bundler" frontend/vite.config.js` — alias present.
- `rg "vue.esm-bundler" frontend/vitest.config.js` — no match (inherited via `mergeConfig`).
- `rg "mergeConfig" frontend/vitest.config.js` — present.
- `rg "vendor_deps|ensure_vendor" src/musicweb/main.py` — still called.

## Acceptance

- [ ] `pnpm --dir frontend install` and `pnpm --dir frontend build` succeed on a clean tree after clone + install of that lockfile.
- [ ] `frontend/dist` is gitignored; `frontend/pnpm-lock.yaml` is tracked.
- [ ] Existing `uv run musicweb` SPA is unchanged.
- [ ] Vue alias lives only in `vite.config.js`; Vitest merges it; `/api` proxy target is `:8765` with `timeout: 0`.
