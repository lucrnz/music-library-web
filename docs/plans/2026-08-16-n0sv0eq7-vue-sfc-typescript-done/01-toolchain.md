# Stage 01: Toolchain

## Status
done

## Description

Add Vue SFC + TypeScript tooling to the existing JavaScript app without converting any application file. After this stage the SPA is still 108 `.js` modules with string templates; `pnpm --dir frontend typecheck` exists and is green; `plugin-vue` is wired; the runtime compiler alias and Options API stay on.

## Rationale

The Vue plugin and `vue-tsc` are prerequisites for the freeze cutover. Landing them first proves the current string-template app still builds, tests, and typechecks (on shims only) before every file is rewritten.

## Invariants

- No application `.js` is renamed, split, or converted.
- No `.vue` or application `.ts` files are added.
- `vue` still resolves to `vue/dist/vue.esm-bundler.js`.
- `__VUE_OPTIONS_API__` stays `true`.
- `pnpm build` remains `vite build` (no `vue-tsc` in the build script yet).
- Vue 3.5.18 and vue-router 4.5.1 are not bumped.
- FastAPI, PWA generation, CSS, and `index.html` are untouched.

## Risks

- `@vitejs/plugin-vue` could change how Vite treats existing JS if misconfigured. Do not add extra plugin options. Keep the bundler alias.
- A `tsconfig` that `include`s `frontend/js` under `strict` will fail immediately. Include only the shim.
- Pinning an `@vitejs/plugin-vue` that does not support Vite 8 will break `dev`/`build`. Verify compatibility with Vite 8.2.1 and Vue 3.5.18 before writing the version.

## Implementation

### Files

- Change `frontend/package.json`
- Change `frontend/pnpm-lock.yaml`
- Change `frontend/vite.config.js`
- Create `frontend/tsconfig.json`
- Create `frontend/env.d.ts`

### Steps

1. Add devDependencies, pinned to the current stable set compatible with Vue 3.5.18 and Vite 8.2.1: `typescript`, `vue-tsc`, `@vitejs/plugin-vue`, `@types/node`. Run `pnpm --dir frontend install` and commit the lockfile.
2. Add script `"typecheck": "vue-tsc --noEmit -p tsconfig.json"`. Do not change `dev`, `build`, `preview`, or `test`.
3. Rewrite `frontend/vite.config.js` to import `vue` from `@vitejs/plugin-vue` and set `plugins: [vue()]`. Leave `base`, `build`, `resolve.alias.vue` → `vue/dist/vue.esm-bundler.js`, `define` (`__VUE_OPTIONS_API__: true` and the two prod flags), and the `/api` proxy (`timeout: 0`) exactly as they are.
4. Add `frontend/tsconfig.json`:
   - `compilerOptions`: `target` ES2022, `module` ESNext, `moduleResolution` bundler, `strict` true, `noEmit` true, `isolatedModules` true, `skipLibCheck` true, `lib` `["ES2022", "DOM", "DOM.Iterable"]`, `moduleDetection` force, `verbatimModuleSyntax` true, **`"types": []`**. Do not set `allowJs`. Do not set `paths` yet. `"types": []` keeps `@types/node` out of the app project (the package is installed for stage 02’s Vite config only).
   - `include`: `["env.d.ts"]` only.
5. Add `frontend/env.d.ts` with `/// <reference types="vite/client" />` and a `declare module "*.vue"` shim (`DefineComponent` default export).

### Verify

- `pnpm --dir frontend typecheck` exits 0.
- `pnpm --dir frontend build` exits 0. `frontend/dist/index.html` still exists.
- `pnpm --dir frontend test` exits 0 (Icon smoke still imports `../js/components/icons/Icon.js`).
- `rg "from \\"@vitejs/plugin-vue\\"" frontend/vite.config.js` matches.
- `rg "vue.esm-bundler" frontend/vite.config.js` still matches.
- `rg "__VUE_OPTIONS_API__: true" frontend/vite.config.js` matches.
- `rg -l "." frontend --glob '*.vue'` is empty. `rg -l "." frontend --glob '*.ts'` is only `frontend/env.d.ts`.
- `rg "\"types\": \\[\\]" frontend/tsconfig.json` matches.
- `frontend/js/` file count and names are unchanged (`git diff --stat frontend/js` is empty).

## Acceptance

- [x] `typescript`, `vue-tsc`, `@vitejs/plugin-vue`, and `@types/node` are pinned in `frontend/package.json` and locked.
- [x] `pnpm --dir frontend typecheck` is documented as a script and passes.
- [x] The running app is still the string-template JS SPA (`dev` and `build` succeed).
- [x] No application source was converted.
