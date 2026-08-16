# Stage 03: Vitest browser smoke (Icon in Chromium)

## Status
done

## Description

Add one headless Chromium test that mounts the existing `Icon` component into a real DOM (with a fixture SVG symbol) and asserts `href="#i-play"`. `pnpm --dir frontend test` is `vitest run`. No coverage, no extra components.

## Rationale

Prove Vue string templates + the bundler alias + Vitest browser mode + Playwright Chromium before the production cutover. `Icon` is the smallest real component; it does not pull stores, router, or downloads.

## Invariants

- Production app code paths other than test-only files do not change (no `Icon.js` rewrite).
- Single test file. No `coverage` config, no snapshot files.
- Vue alias still comes only from `vite.config.js` via `mergeConfig`.

## Risks

- Playwright Chromium is not installed by `pnpm install` alone. The one-time command is `pnpm --dir frontend exec playwright install chromium`. Stage 05 documents it.
- `Icon` uses `<use :href="'#i-' + name" />`. Without a fixture `<symbol id="i-play">` the assertion is weaker; include the symbol.

## Implementation

### Files

- Create `frontend/tests/icon.smoke.test.js`
- Change `frontend/package.json` only if the `test` script is missing from stage 01
- Change `frontend/vitest.config.js` only if `test.include` is missing from stage 01

### Steps

1. One-time on the machine: `pnpm --dir frontend exec playwright install chromium`. Do not commit browsers.
2. `frontend/tests/icon.smoke.test.js`:
   - Import `createApp` from `vue`, `Icon` from `../js/components/icons/Icon.js`.
   - `let app` in describe-scope (so `afterEach` can see it).
   - `beforeEach`: set `document.body.innerHTML` to a hidden `<svg>` containing `<symbol id="i-play" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></symbol>` plus `<div id="host"></div>`.
   - In the test: `app = createApp(Icon, { name: "play" }); app.mount("#host")`.
   - Assert `document.querySelector("#host use").getAttribute("href") === "#i-play"`. Do not also check `xlink:href`.
   - `afterEach`: `app.unmount()`.
3. Confirm `pnpm --dir frontend test` is `vitest run`. Do not add `vitest-browser-vue`.

### Verify

- `pnpm --dir frontend test` exits 0; output names Chromium / playwright and `icon.smoke`.
- Re-run `pnpm --dir frontend test` a second time (not a flake on the fixture HTML).
- `rg "coverage" frontend/vitest.config.js frontend/package.json` — no coverage reporter.
- `rg "createApp\\(App" frontend/tests` — no full-app mount.
- `rg "xlink:href" frontend/tests` — no match.

## Acceptance

- [ ] One green Chromium test mounts real `Icon` (`let app` in describe-scope) and checks `href` is `#i-play`; `afterEach` unmounts.
- [ ] `pnpm --dir frontend test` is the command (living docs in stage 05; the script exists now).
- [ ] `frontend/js` is unmodified except whatever stage 02 already did.
