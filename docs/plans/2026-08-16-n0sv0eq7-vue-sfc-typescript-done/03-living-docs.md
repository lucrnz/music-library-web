# Stage 03: Living docs and ADR

## Status
done

## Description

Replace the living “plain JS / No TypeScript / `frontend/js/`” story with Vue SFC + TypeScript under `frontend/src/`. This plan directory stays an archive, not the ADR.

## Rationale

`AGENTS.md` currently states “No TypeScript.” That line is binding for the next agent until living docs change. Path strings still point at `frontend/js/…`.

## Invariants

- Docs describe intent, ownership, and commands — not `vue-tsc` flags, hashed `/assets/` names, or prop lists.
- Source remains the source of truth for request shapes, encoder argv, and exact Vue SFC markup.
- This `docs/plans/` directory is not linked as living design.
- Exclusive audio is still “not Electron.” Updating “the SPA stays plain JS” must not reopen an Electron companion.

## Risks

- Updating only `AGENTS.md` leaves `technical-decisions.md` and `docs/frontend/conventions.md` contradicting it.
- Systems pages that only need a path fix will get accidental redesigns. Change source-of-truth paths; do not rewrite those systems.

## Implementation

### Files

- Change `AGENTS.md`
- Change `docs/architecture/technical-decisions.md`
- Change `docs/architecture/index.md`
- Change `docs/frontend/conventions.md`
- Change `docs/development/commands.md`
- Change `docs/development/project-structure.md`
- Change `docs/systems/pwa.md`
- Change `docs/systems/playback.md`
- Change `docs/systems/downloads.md`
- Change `docs/systems/connectivity.md`
- Change `docs/systems/diagnostics.md`
- Change `docs/systems/exclusive-audio.md`
- Change `docs/setup.md` only if it names `frontend/js/` or “plain JavaScript”
- Change `docs/README.md` only if a map entry names `frontend/js/`

Do not edit files under `docs/plans/`.

### Steps

1. **ADR.** In `technical-decisions.md`, extend **Vite + pnpm frontend, FastAPI serves dist**: the SPA is Vue 3 SFC (`<script setup lang="ts">`) plus TypeScript modules under `frontend/src/`; `pnpm --dir frontend typecheck` is `vue-tsc --noEmit` on the app tsconfig; `pnpm --dir frontend build` typechecks then Vite-emits `frontend/dist`; CSS stays in `frontend/css/`; stores stay custom reactive modules (not Pinia); client types are hand-written from today’s shapes (existing JSDoc + unmapped snake_case fields next to their owner; no OpenAPI codegen; no new runtime mappers); SW stays Python-generated. In **Exclusive audio via optional companion**, replace “The SPA stays plain JS” with “The SPA is Vue SFC + TypeScript; exclusive playback is still not an Electron rewrite.”
2. **AGENTS.md.** Replace “plain ESM JavaScript … No TypeScript” with Vue 3 SFC + TypeScript under `frontend/src/`. Essentials: add `pnpm --dir frontend typecheck`. Keep uv + pnpm, no root `package.json`, no second bundler / no Node-generated SW, frontend deps only in `frontend/package.json`.
3. **conventions.md.** Source-of-truth paths become `frontend/src/main.ts`, `router.ts`, `api.ts`, `components/App.vue`, `stores/`, `pwa.ts`. Architecture: Vite + `@vitejs/plugin-vue` + `vue-tsc`; authoring is `<script setup lang="ts">`; imports are `@/` + `.vue` suffixes + extensionless TS; CSS remains `frontend/css/`. Tracks/albums/lyrics still normalize at `models/*`; do not claim every leaf is camelCase — artist/folder/browse keep today’s server field names. Drop any implication that components are `.js` `defineComponent` modules.
4. **commands.md.** Document `pnpm --dir frontend typecheck`. Note that `pnpm --dir frontend build` runs `vue-tsc --noEmit` on the app tsconfig then Vite. Test command stays `pnpm --dir frontend test` (now `*.test.ts`).
5. **project-structure.md.** Frontend is Vite Vue SFC + TypeScript under `frontend/src/`. Row menus live under `frontend/src/components/menu/`. Layout breakpoint helper is `frontend/src/layout.ts`. Downloads live under `frontend/src/downloads/`.
6. **architecture/index.md.** SPA entry `frontend/src/main.ts`. Layers table: `frontend/src/` instead of `frontend/js/`. Overview can say “Vue 3 SFC + TypeScript client built by Vite.”
7. **Systems pages** (playback, downloads, connectivity, diagnostics, exclusive-audio, pwa): replace `frontend/js/` with `frontend/src/` and `.js` with `.ts` / `.vue` on source-of-truth bullets only. Do not redesign those pages.
8. Grep living docs (not `docs/plans/`) for leftover `frontend/js`, `No TypeScript`, `plain JS` (SPA sense), and `defineComponent` as the documented authoring style. Fix stragglers. A past-tense sentence in an archive plan is fine.

### Verify

- `rg "No TypeScript|frontend/js" AGENTS.md docs --glob '!docs/plans/**'` — no living hits. (`frontend/js` must be gone from living docs.)
- `rg "plain JS" docs --glob '!docs/plans/**'` — no living claim that the SPA is plain JS. Exclusive-audio companion out-of-scope may still mention TypeScript in the Electron sense only if it cannot be read as a SPA ban.
- `rg "pnpm --dir frontend typecheck" docs/development/commands.md AGENTS.md` matches.
- `rg "frontend/src/main.ts" docs/frontend/conventions.md docs/architecture/index.md` matches.
- `rg "script setup" docs/frontend/conventions.md` matches.
- This plan directory is not added to `docs/README.md` or `docs/architecture/index.md` as living design.

## Acceptance

- [x] A new agent reading only living docs would author Vue SFCs + TypeScript under `frontend/src/`, run `typecheck`, and would not treat “No TypeScript” as current.
- [x] Technical decisions state SFC + TS, custom stores, hand-written types of today’s shapes (no new mappers, no OpenAPI), CSS in `frontend/css/`, and SW still Python-generated.
- [x] Exclusive audio is still “not Electron”; the SPA language is no longer “plain JS.”
- [x] Systems source-of-truth paths point at `frontend/src/`.
- [x] This plan directory is not cited as the ADR.
