# Stage 03: Fail-closed service worker install

## Status
done

## Description

Abort service worker install if any precache URL fails. A partial inventory must not activate and delete the previous complete shell cache.

## Rationale

`CRITICAL_URLS` is only `/`, `main.js`, and the Vue URL. Vue Router and every app module can miss, install still succeeds, activate drops old `musicweb-*` caches, and the next offline launch 503s mid-import. Fail-closed keeps last-known-good shell.

## Invariants

- `PRECACHE_URLS` is still the generated inventory (`/` + `static/{css,js,img,vendor}`).
- Any failed fetch or non-OK response in that list throws out of `install` (worker discarded).
- `/api/*` and `/sw.js` stay uncached.
- Quiet activate / no in-app reload banner unchanged.

## Risks

- A flaky first install (one static 404) refuses the new worker and keeps the old one. Prefer that over a hole. Operator must have a complete `static/` (vendor downloaded) for a *first* install — already required.

## Implementation

### Files

- Change `src/musicweb/static/sw.template.js`

### Steps

1. Delete `CRITICAL_URLS` and the “add vue.esm-browser to critical” loop.
2. After the `Promise.all` precache, if `failedUrls.length`, `throw new Error` listing those URLs (same message shape as today’s critical abort is fine).
3. Leave per-URL `console.warn` so a failed install still logs which file missed.
4. Do not change `networkFirstNavigation`, `cacheFirstStatic`, `shouldBypass`, or activate cache-name cleanup.

### Verify

- `rg "CRITICAL_URLS" src/musicweb/static/sw.template.js` — no matches.
- `rg "failedUrls.length" src/musicweb/static/sw.template.js` — install throws when the array is non-empty.
- Manual, online: DevTools → Application → Service Workers shows a new worker after reload; cache `musicweb-*` still contains `/`, `main.js`, `vue-router.esm-browser.prod.js`, and `static/js/stores/settings.js`.
- Manual, if easy: serve once with a temporary rename of a non-critical JS file, trigger `sw.js` update, confirm the new worker **does not** activate (redundant / error); restore the file.

## Acceptance

- [ ] Install commits only when every `PRECACHE_URLS` entry was fetched OK and cached.
- [ ] A single app-module miss leaves the previous controlling worker and its cache.
- [ ] `/api/*` is still network-only.
