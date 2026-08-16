**Archive.** Decisions in this file were current as of 2026-08-16 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Vue SFC + TypeScript frontend

## Goal

Convert the Vue 3 SPA from `defineComponent` modules with in-JS string templates and plain JavaScript to Vue single-file components (`<script setup lang="ts">`) plus TypeScript modules — without changing playback, downloads, PWA, or UI behavior.

## Settled decisions

- **Freeze-and-convert.** The application source tree is never mixed `.js` / `.ts` / `.vue`. Tooling may land first on the existing JS app; the rewrite of application source is one cutover.
- **Authoring.** Converted components use `<script setup lang="ts">` then `<template>`. No `<style>` blocks. Only the 38 files that `export default defineComponent` become `.vue`. Composables and helpers stay TypeScript modules.
- **CSS.** Keep the six global sheets under `frontend/css/`. Do not relocate rules into SFCs.
- **Stores.** Keep the custom module-scope `reactive()` stores (including the player facade split). Do not introduce Pinia.
- **API types.** Hand-write TypeScript from today’s JSDoc `@typedef`s. Do not generate types from FastAPI OpenAPI. Do not add new runtime mappers (`fromApiArtist`, folder mappers, or a camelCase rewrite of artist/folder/browse leaves). Track / album / lyrics stay the only normalize-to-camelCase boundary.
- **Type boundary.** `apiGet` / `apiPost` / `apiPut` / `apiPatch` / `apiDelete` become generic `<T>(...) => Promise<T>`. Named fetchers that already map return `Track` / `Album` / `Lyrics`. Named fetchers and loaders that do not map get a hand-written interface of **today’s fields**, snake_case included (`album_count`, browse `dirs`/`files`, …). Put those types next to the owner (`models/` only for canonical client records; otherwise `loaders.ts` / `api.ts` / `downloads/db.ts` / the tree source that already owns `TreeNode`). IDB helpers stay generic; export record types from the downloads package. Each `reactive(...)` store gets an explicit interface of its current keys. Existing JSDoc unions (`PlaySourceState`, `PlayBlockReason`, `ConnectivityState`, `QueueStateName`, …) become exported types. Casts only at `res.json()` and IDB `req.result` into those records. No `any`.
- **Layout.** Rename `frontend/js/` → `frontend/src/` in the cutover. Entry becomes `frontend/src/main.ts`.
- **Imports.** `moduleResolution: "bundler"`. Import `.vue` with a `.vue` suffix. Import TypeScript modules with no extension. Alias `@/` → `frontend/src/`. Every import of a `src/` module uses `@/` (tests included).
- **Strictness.** `"strict": true` on `.ts` and `.vue`. No `allowJs`. No `checkJs`. Do not use `any` to silence the cutover.
- **Quality bar.** `vue-tsc --noEmit -p tsconfig.app.json` is the type gate (also the first half of `pnpm build`). No `vue-tsc --build`, no composite project references. `tsconfig.node.json` exists so Vite/Vitest configs are not typechecked against DOM; it is not part of the gate. Keep the single Vitest browser Icon smoke (ported to the SFC). No ESLint, Prettier, or new component test suite.
- **Staging.** (1) toolchain on the still-JS app, (2) one conversion cutover, (3) living docs / ADR.
- **Configs.** After the cutover, Vite and Vitest configs are TypeScript (`vite.config.ts`, `vitest.config.ts`).
- **Vue runtime after cutover.** Drop the `vue/dist/vue.esm-bundler.js` alias (runtime-only compiler). Set `__VUE_OPTIONS_API__: false`. `RouteShell` is a function component (`() => null`), not an options object with `render:`.
- **Unchanged pins.** Vue **3.5.18** and vue-router **4.5.1** stay. New toolchain packages (`typescript`, `vue-tsc`, `@vitejs/plugin-vue`, `@types/node`) are pinned to the current stable set compatible with those pins and Vite **8.2.1** at implement time; commit `frontend/pnpm-lock.yaml`.

## Design

Today the SPA is 108 JS modules under `frontend/js/`: 38 Vue components (Composition `setup()` inside `defineComponent` + a `template:` string) and 70 non-component modules. Vite aliases `vue` to the full compiler so those strings compile at build time. There is no `@vitejs/plugin-vue`, no `tsconfig`, and one Chromium smoke test that mounts `Icon`.

The migration does not change the runtime architecture. Stores remain exported reactive objects plus functions. Track / album / lyrics still normalize snake_case at `models/*`; artist, folder, and browse leaves already read today’s server field names (`album_count`, `track_count`, browse `dirs`/`files`) and keep doing that. Downloads, exclusive audio, connectivity, and the Python-generated service worker stay where they are. FastAPI still serves `frontend/dist` and still replaces the `#musicweb-config` script body.

What changes is the compilation and type surface:

1. **SFC compiler.** `@vitejs/plugin-vue` compiles `<template>` at build time. After every string template is gone, the app uses the runtime-only Vue build and Options API can be compiled out. A leftover `template:` option then fails loudly.
2. **TypeScript.** Existing JSDoc typedefs become exported types next to their owners. Unmapped HTTP and IDB payloads get interfaces of the fields the code already reads — not `unknown` plus casts, and not new mappers. `vue-tsc --noEmit -p tsconfig.app.json` is the check; after the cutover it is also the first half of `pnpm build`. App tsconfig sets `"types": []` so `@types/node` does not leak into the SPA.
3. **Path layout.** `frontend/src/` is the application root. `@/` is the only way application code addresses that root. `frontend/css/`, `frontend/public/`, and `frontend/index.html` stay put. `index.html` points at `./src/main.ts` in source; production emit remains hashed `/assets/*`.
4. **SFC conversion recipe.** `defineComponent({ name, props, emits, components, setup, template })` becomes `defineProps` / `defineEmits` / inlined `setup` body / the same markup in `<template>`. Child `components: { … }` registrations go away (script setup registers imports). The two `expose` sites become `defineExpose`: `TreeView` (`expandPath`, `bump`, `visible`) and `NowPlayingFull` (`focusClose`, `closeBtn`). Type-only props — no runtime validators.

File-by-file `.js` → `.vue` / `.ts` mapping: [conversion-inventory.md](./conversion-inventory.md).

The cutover is one reviewable source rewrite. Implementers may use stacked local commits inside that stage, but `main` must not contain a mixed application tree.

## Stage map

1. **Toolchain** can ship alone. It adds the Vue plugin, TypeScript, `vue-tsc`, and a typecheck script while every application file is still JS. The runtime compiler alias and `__VUE_OPTIONS_API__: true` stay, because string templates still need them. Proves `plugin-vue` does not break the existing app before the rewrite.
2. **Conversion** depends on 01 (plugin, `vue-tsc`, and `strict` tsconfig must already exist). It is the only stage that rewrites application source: `js/` → `src/`, SFCs, TypeScript, `@/`, runtime-only Vue, Options API off, configs to `.ts`, `vue-tsc` in `pnpm build`, Icon smoke port. After this stage there is no application `.js`.
3. **Living docs** depends on 02 so paths and commands match the tree that actually landed. `AGENTS.md` currently says “No TypeScript”; that line is binding until this stage. The plan directory is not the ADR.

## Out of scope

- Pinia
- OpenAPI / `openapi-typescript` codegen
- ESLint, Prettier, or other lint/format toolchains
- Expanding the Vitest suite beyond the ported Icon smoke
- Moving CSS into SFC `<style>` blocks, or moving `frontend/css/` under `src/`
- Changing playback, download, connectivity, exclusive-audio, or PWA behavior
- Generating the service worker in Node / Workbox
- A second bundler, a root `package.json`, or a pnpm workspace
- GitHub Actions / CI
- Vue or vue-router version upgrades
- Electron or a TypeScript companion rewrite
- New runtime mappers (`fromApiArtist` and the like) or a camelCase rewrite of artist / folder / browse leaves
- `vue-tsc --build` / composite project references
- `@vue/tsconfig` (not a pinned dep)

## Assumptions

- Implementer has Node 20+ and pnpm; the Python/uv workflow is unchanged.
- `@vitejs/plugin-vue` on a tree with zero `.vue` files is a no-op and does not change how in-JS `template:` strings compile (the `vue.esm-bundler.js` alias remains in stage 01).
- `downloads/worker.js` stays a normal ESM `import()`, not `new Worker(...)`. Default Vite bundling is enough after it becomes `.ts`.
- The Python SW inventory walks `frontend/dist` and does not care about source extensions. No change to `pwa_shell.py` or `sw.template.js` is required.
- FastAPI’s `index.html` rewrite only touches `#musicweb-config`. Changing the entry script to `./src/main.ts` does not affect that replace.
- Root `.gitignore` already ignores `dist/` / `frontend/dist`.
- No GitHub Actions directory exists; documenting `pnpm --dir frontend typecheck` is sufficient.
- Strict conversion of today’s loosely typed JSDoc will produce real `vue-tsc` errors. The cutover fixes them with exported types of **today’s** shapes and narrowing at `res.json()` / IDB `req.result`, not `any` and not new mappers.
- A single Icon smoke cannot certify the freeze rewrite. Stage 02’s verify includes a documented manual pass through library, play, queue, settings, and downloads.
