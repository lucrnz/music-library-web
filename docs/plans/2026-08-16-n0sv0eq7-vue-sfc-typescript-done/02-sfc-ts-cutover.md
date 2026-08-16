# Stage 02: SFC + TypeScript cutover

## Status
done

## Description

One freeze rewrite of the SPA: `frontend/js/` becomes `frontend/src/`, every component becomes a `<script setup lang="ts">` SFC, every other module becomes TypeScript, imports use `@/` + bundler resolution, Vite/Vitest configs become TypeScript, Vue switches to runtime-only with Options API off, `pnpm build` runs `vue-tsc` first, and the Icon smoke mounts `Icon.vue`. After this stage there is no application `.js`.

## Rationale

The user chose a freeze cutover so `main` never contains a mixed JS/TS/SFC tree. Tooling from stage 01 is already in place; this stage spends it on the rewrite.

## Invariants

- Product behavior is unchanged: playback sinks, play-source resolution, download queue policy, connectivity, exclusive audio, PWA registration (including DEV skip), `#musicweb-config` read, and route table.
- CSS stays in `frontend/css/` and is still linked from `index.html`. No `<style>` blocks.
- Store public exports keep their names (`player`, `pl`, `settings`, `ui`, `dialog`, `confirmDialog`, `promptDialog`, `showToast`, `loadPlaylist`, `playIndex`, …). `player.ts` still re-exports `player` from `playerState.ts`.
- Track / album / lyrics still normalize to camelCase at `models/*`. Artist, folder, and browse leaves keep today’s server field names (`album_count`, `track_count`, browse `dirs`/`files`). No new runtime mappers.
- Type boundary is the policy in [design.md](context/design.md): generics on `apiGet`/`apiPost`/…; unmapped payloads typed as today’s shapes next to their owner; IDB helpers stay generic; casts only at `res.json()` and IDB `req.result`. No `any`.
- Only the 38 `defineComponent` files become `.vue`. The 14 helpers under `components/` stay modules.
- `allowJs` is off. No `any`. No leftover `template:` option on a component.
- `__VUE_OPTIONS_API__` is `false`. There is no `vue.esm-bundler.js` alias.
- Service worker stays Python-generated. No Workbox. No second bundler.
- Vue 3.5.18 and vue-router 4.5.1 stay pinned.

## Risks

- Strict typing of loosely JSDoc’d stores, downloads (IDB/OPFS), and player unions is the bulk of the work. Under-typed leftovers will fail `vue-tsc` and block `pnpm build`.
- Forgetting `defineExpose` on `TreeView` breaks folder-tree focus (`LibraryTreePane` calls `expandPath`). Forgetting it on `NowPlayingFull` drops focus-on-expand (`PlayerBar` calls `fullRef.value?.focusClose?.()`). Both are silent product regressions; the leftover sweep will not catch them.
- Dropping `components: { … }` and then omitting an import yields a silent missing child at runtime. Every former `components` registration must become an import.
- A misaligned `@/` alias (Vite vs `tsconfig.app.json`) makes `dev` work and `vue-tsc` fail, or the reverse.
- Switching to runtime-only Vue before the last `template:` string is gone yields a runtime compile error. Delete every `template:` in the same change that drops the alias.
- `verbatimModuleSyntax` will reject value imports of types. Use `import type`.
- Mixing DOM and Node libs in one tsconfig will false-positive on `vite.config.ts`. Put Vite/Vitest configs in `tsconfig.node.json` and **do not** include that file in the `vue-tsc` gate. App project must set `"types": []`.

## Implementation

### Files

Application rewrite (see [conversion-inventory.md](context/conversion-inventory.md) for the 108-file map):

- Delete `frontend/js/` (after `git mv` to `frontend/src/` and conversion).
- Create `frontend/src/**/*.vue` (38) and `frontend/src/**/*.ts` (70) plus `frontend/src/vite-env.d.ts`.

Tooling and shell:

- Change `frontend/index.html` (`./js/main.js` → `./src/main.ts`)
- Create `frontend/vite.config.ts`; delete `frontend/vite.config.js`
- Create `frontend/vitest.config.ts`; delete `frontend/vitest.config.js`
- Replace `frontend/tsconfig.json`; create `frontend/tsconfig.app.json` and `frontend/tsconfig.node.json`
- Delete `frontend/env.d.ts` (replaced by `frontend/src/vite-env.d.ts`)
- Change `frontend/package.json` (`typecheck` and `build` scripts)
- Change `frontend/pnpm-lock.yaml` only if install rewrites it
- Create `frontend/tests/icon.smoke.test.ts`; delete `frontend/tests/icon.smoke.test.js`

### Steps

Do this as one stage. Local stacked commits are allowed; do not merge a half-converted tree.

1. **Move the tree.** `git mv frontend/js frontend/src`. Do not leave a `frontend/js/` directory.

2. **Replace tsconfig with an app/node split (no `--build`).**
   - `tsconfig.app.json`: stage-01 strict/bundler/verbatim/ES2022/DOM settings, plus `"paths": { "@/*": ["./src/*"] }`, plus **`"types": []`**. `include` `src/**/*.ts`, `src/**/*.vue`, `src/**/*.d.ts`, `tests/**/*.ts`. No `allowJs`. No `composite`.
   - `tsconfig.node.json`: same module settings, `lib` ES2022 only (no DOM), `"types": ["node"]`; `include` `vite.config.ts`, `vitest.config.ts`. Not part of the gate.
   - `tsconfig.json`: `{ "extends": "./tsconfig.app.json" }` so editors and a bare `vue-tsc --noEmit` hit the app project. No `references`, no `composite`.
   - `package.json` `typecheck` becomes `vue-tsc --noEmit -p tsconfig.app.json`. `build` becomes `vue-tsc --noEmit -p tsconfig.app.json && vite build`.

3. **Vite / Vitest TypeScript configs.**
   - `vite.config.ts`: `defineConfig`, `plugins: [vue()]`, `resolve.alias` only `@` → `fileURLToPath(new URL("./src", import.meta.url))`. **Do not** alias `vue` to `vue.esm-bundler.js`. `define.__VUE_OPTIONS_API__` is `false`. Keep `base: "/"`, `build.outDir: "dist"`, `emptyOutDir: true`, the two other Vue `define` flags, and the `/api` proxy with `timeout: 0`.
   - `vitest.config.ts`: `mergeConfig` the Vite config; `test.include` is `["tests/**/*.test.ts"]`; browser Playwright Chromium headless unchanged.

4. **Shims.** Move the Vue/Vite declarations to `frontend/src/vite-env.d.ts`. Delete `frontend/env.d.ts`.

5. **Convert modules bottom-up** (types before consumers). For each `.js` file, write the `.ts` sibling (or replace in place after the mv) and delete the `.js`. Rewrite every `src/` import to `@/…` with no extension (`.vue` suffix only for SFCs). Promote every JSDoc `@typedef` to an exported type next to its owner.
   Type rules (do not invent a second policy):
   - `apiGet` / `apiPost` / `apiPut` / `apiPatch` / `apiDelete` are generic `<T>(...) => Promise<T>`. The single cast is `res.json()` → `T`.
   - Named fetchers that already map (`fetchTrack`, `fetchLyrics`, `fetchTracksMeta`, `fetchAlbumTracks`, `fetchPlaylistTracks`, `fetchAlbum`, `fetchAlbums`, `fetchArtistAlbums`, `collectTracks`) keep returning `Track` / `Album` / `Lyrics` (or arrays). `fetchSearch` stays mixed: mapped albums/tracks + unmapped artists.
   - Named fetchers and loaders that do **not** map (`fetchArtist`, browse `apiGet("/api/browse…")`, `GET /api/artists?limit=500`, search `artists`) get a hand-written interface of **today’s fields**, snake_case included. Examples: artist list items with `album_count` / `track_count`; browse payload `{ dirs, files }`. Put those types next to the caller that already knows the shape (`api.ts` or `loaders.ts`), not in a new `types/` dump.
   - Do **not** add `fromApiArtist` or rewrite artist/folder leaves to camelCase.
   - IDB: `getOne<T>` / `putOne<T>` / `withStores` stay generic. Export record types for tracks/albums/artists/queue/lyrics/meta from the downloads package (`db.ts` / `catalog.ts` / `queue.ts` — catalog and queue already know these shapes). The single cast is IDB `req.result` → `T`.
   - `TreeNode` is the existing typedef plus the `lossyKind` field the sources already set. `data` is a narrow interface the sources already fill (per `kind` if that is already how they branch) — not `object`.
   - Each `reactive(...)` store gets an explicit interface of its current keys. Existing JSDoc unions (`PlaySourceState`, `PlayBlockReason`, `ConnectivityState`, `QueueStateName`, `LibraryLayout`, `PlaybackPolicy`, `DialogMode`, …) are exported types.
   - No `any`. No `unknown` + `as` soup at call sites.
   1. `models/track.ts`, `album.ts`, `lyrics.ts` and `playback/sinks/types.ts`.
   2. Leaf utilities: `lossyKind`, `playBlock`, `qualityRank`, `layout`, `util`, `codecSupport`, `codecProbes`, `connectivity`, `connectivityUi`, `networkConstraints`, `playbackStatus`.
   3. `api.ts` (keep re-exports of the model mappers; apply the generic + named-fetcher rules above).
   4. Stores (`playerState` → `playerPrefs` / `playerSession` → `player`; then `playlist`, `settings`, `ui`, `dialog`, `modalLock`, `connectivity`, `exclusiveAudio`). Type each `reactive(...)` object.
   5. `downloads/*`, `exclusive/*`, `lyrics/*`, `diag/*`, `playback/sinks/*` implementations.
   6. Component helpers: `useLibraryLocation`, `useBrowseLayout`, `browseChrome`, `libraryActions`, `loaders`, `rows.ts`, `queueMenuItems`, tree session/navigation/flatten/sources.
   7. `router.ts`, `pwa.ts`, `main.ts`. `main.ts` keeps the same init order and `createApp(App)` mount. `index.html` script is `./src/main.ts`. `RouteShell` is `const Shell = () => null` (function component). Do not keep `{ name, render: () => null }`.

6. **Convert the 38 components to SFCs** (leaves first: `Icon`, row cards, menu items, then hosts, then `App`). Recipe:
   - `<script setup lang="ts">` then `<template>`. No `<style>`.
   - `defineProps<{ … }>()` / `defineEmits<{ … }>()` from the old `props` / `emits`. Type-only — no runtime validators. Preserve required/optional and defaults via `withDefaults` where the old `default` existed (`TreeView.roots`, `emptyMessage`, …).
   - Inline the `setup()` body. Drop the `return { … }`. Bindings used by the template stay in script scope.
   - Delete `components: { … }`. Import each former child (`.vue`).
   - `TreeView`: `defineExpose({ expandPath, bump, visible })`.
   - `NowPlayingFull`: `defineExpose({ focusClose, closeBtn })`.
   - Keep existing prop names, emit names, slot names, and DOM class names. These are the only two `expose(` sites in the tree.

7. **Port the smoke test.** `frontend/tests/icon.smoke.test.ts` is the same Chromium mount, importing `Icon` from `@/components/icons/Icon.vue`. Same fixture `<symbol id="i-play">`, same `href="#i-play"` assertion, same describe-scope `app` + `afterEach` unmount.

8. **Sweep leftovers.** There must be no `frontend/js/`, no `frontend/**/*.js` except nothing (configs and tests are `.ts`). No `from "./….js"` inside `src/` or `tests/`. No `template:` option. No `render:` option. No `vue.esm-bundler`. No `vue-tsc --build` in `package.json`.

### Verify

Automated:

- `pnpm --dir frontend typecheck` exits 0 (`vue-tsc --noEmit -p tsconfig.app.json`).
- `pnpm --dir frontend build` exits 0 and runs that same `vue-tsc` line before Vite. `frontend/dist/index.html` exists and references hashed `/assets/…`, not `./src/main.ts`.
- `rg "vue-tsc --build|\"composite\"" frontend/package.json frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json` has no hits.
- `rg "\"types\": \\[\\]" frontend/tsconfig.app.json` matches. `rg "\"types\": \\[\"node\"\\]" frontend/tsconfig.node.json` matches.
- `pnpm --dir frontend test` exits 0.
- `find frontend/src frontend/tests -name '*.js'` is empty.
- `test ! -e frontend/js` and `test ! -e frontend/vite.config.js` and `test ! -e frontend/vitest.config.js`.
- `rg "vue\\.esm-bundler|__VUE_OPTIONS_API__: true|template:|render:" frontend --glob '!frontend/dist/**' --glob '!frontend/node_modules/**'` has no hits.
- `rg "from ['\\\"][^'\\\"]+\\.js['\\\"]" frontend/src frontend/tests frontend/vite.config.ts frontend/vitest.config.ts` has no hits.
- `rg "frontend/js" frontend --glob '!frontend/dist/**' --glob '!frontend/node_modules/**'` has no hits.
- `rg "path: ['\\\"]@/\\\\*" frontend/tsconfig.app.json` (or the JSON `"@/*"` key) exists; `rg "alias" frontend/vite.config.ts` includes `@`.

Manual (required — the smoke test only covers `Icon`):

- `pnpm --dir frontend dev` against `uv run musicweb`: open `:5173`.
- Browse `/folders` (list + tree if shown), open an album, play a track. Transport (pause/seek/next) works. Mini-player and expanded now-playing render.
- Open `/queue`, reorder or remove a row if the library has tracks, overflow menu opens.
- Open Settings (scan panel + exclusive panel still mount). Open Downloads manager. Trigger a toast (e.g. a soft error) and a confirm dialog (e.g. remove-download if a download exists, or another `confirmDialog` path).
- Expand now-playing: close control receives focus (the `NowPlayingFull` `focusClose` expose). Folder tree: expand-to-path still works (`TreeView.expandPath`).
- Repeat the library + player chrome at a mobile viewport width (tab bar + mini-player) and at desktop (`min-width: 900px`, dual pane).
- `pnpm --dir frontend build` then browse `:8765` (FastAPI-served dist). Hard-refresh a client route (`/artists`, `/queue`). `#musicweb-config` is still valid JSON. SW still does not register on `:5173`.

## Acceptance

- [x] Every former `defineComponent` file is a `.vue` SFC with `<script setup lang="ts">`. Every other former `frontend/js/**/*.js` file is `.ts` under `frontend/src/`.
- [x] `pnpm --dir frontend typecheck`, `build`, and `test` all pass. `build` typechecks first via `vue-tsc --noEmit -p tsconfig.app.json` (not `--build`).
- [x] Vue is runtime-only; Options API is compiled out. `RouteShell` is `defineComponent({ setup: () => () => null })` (a bare `() => null` is treated as a vue-router async factory). `TreeView` and `NowPlayingFull` `defineExpose` the members listed above.
- [x] Unmapped artist/folder/browse payloads are typed as today’s snake_case shapes. No new `fromApiArtist` (or similar) mapper.
- [x] `@/` resolves in both Vite and `vue-tsc`. Application imports do not use `.js` specifiers.
- [x] Icon smoke mounts `Icon.vue` in Chromium and still asserts `#i-play`.
- [x] Manual pass above did not change playback, downloads, settings, or PWA behavior.
- [x] `frontend/js/` is gone. No application `.js` remains.
