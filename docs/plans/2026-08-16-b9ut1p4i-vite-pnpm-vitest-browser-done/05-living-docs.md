# Stage 05: Living docs and ADR

## Status
done

## Description

Replace the “no bundler / uv-only frontend / vendor_deps” story in living docs with the Vite + pnpm cutover. This plan directory stays an archive, not the ADR.

## Rationale

The decision has to live in the project’s normal docs or the next agent will treat `AGENTS.md` “No npm/webpack/vite” as still binding.

## Invariants

- Docs describe intent and commands, not hashed filenames or Vite plugin argv.
- Source remains the source of truth for the config-script replace string, mount paths, and encoder/API shapes.
- This `docs/plans/` directory is not linked as living design.

## Risks

- Updating only `AGENTS.md` leaves `technical-decisions.md` and `docs/frontend/conventions.md` contradicting it. Touch every living page that states the old rule.
- Stale path strings (`src/musicweb/static/js/…`) in systems pages will strand readers. Update source-of-truth paths; do not rewrite those systems’ design.

## Implementation

### Files

- Change `AGENTS.md`
- Change `docs/architecture/technical-decisions.md`
- Change `docs/architecture/index.md` (SPA entry path if listed)
- Change `docs/frontend/conventions.md`
- Change `docs/development/commands.md`
- Change `docs/development/project-structure.md`
- Change `docs/systems/pwa.md`
- Change `docs/setup.md` (prereqs / first run)
- Change `docs/README.md` only if the map should mention `frontend/`
- Change any systems page “Source of truth” path that still points at `src/musicweb/static/js/…` to `frontend/js/…` (playback, downloads, connectivity, diagnostics, exclusive-audio) — path only, not a redesign

### Steps

1. **ADR:** In `technical-decisions.md`, replace **No frontend bundler** with **Vite + pnpm frontend, FastAPI serves dist**. State: Vue/Router versions live in `frontend/package.json`; `pnpm --dir frontend build` is required before `uv run musicweb` and before a green `musicweb doctor`; SW stays Python-generated from dist inventory; cache-first is precache membership; HTML config is valid `{"publicOrigin":""}` in source, FastAPI replaces that script body. Delete the vendor-pins source-of-truth bullet; point at `frontend/package.json`. Update the “Do not introduce a Node build step” guardrail to “do not add a second bundler / do not generate the SW in Node without a new decision.”
2. **AGENTS.md:** Entrypoint still `uv run musicweb`, plus frontend commands. Hard rules: drop “Vendor versions change only in `vendor_deps.py`” and “No npm/webpack/vite.” Say frontend deps change only in `frontend/package.json`; tooling is uv (Python) + pnpm (frontend). No TypeScript / lint / format claims.
3. **conventions.md:** Entry `frontend/js/main.js`, HTML `frontend/index.html`, vendor pin line gone. Architecture: Vite ESM + pnpm; FastAPI replaces `#musicweb-config`; SW skip in DEV. Guardrail: do not revert to import-map + unpkg without a new decision.
4. **commands.md:** Install: Node 20+, pnpm, `pnpm --dir frontend install`, `pnpm --dir frontend exec playwright install chromium` (for tests). First run: `pnpm --dir frontend build` then `uv run musicweb`. Dev: two processes (`uv run musicweb` + `pnpm --dir frontend dev`, open `:5173`). Test: existing pytest block plus `pnpm --dir frontend test`. Doctor: now includes frontend dist. Remove the unpkg-on-first-start paragraph; replace with missing-dist fail.
5. **project-structure.md:** Root includes `frontend/`. Remove `vendor_deps.py` and “no-bundler ESM under `static/`.” Package table: no `static/` SPA; PWA template is `src/musicweb/sw.template.js`; `templates/` gone if deleted.
6. **pwa.md:** Inventory walks `frontend/dist`; cache-first is precache membership; fingerprint uses `dist / url.lstrip("/")`; icons still `/static/img/…`; no Workbox. Request-handling table: `/api/*` and `/sw.js` network-only; `/manifest.webmanifest` stays network first / offline cache or 503 (`networkFirstManifest`, not on the precache list); navigations network-first with offline `/`; everything else cache-first iff membership. Update source-of-truth paths (`frontend/js/pwa.js`, `frontend/index.html`, `frontend/public/static/img/`).
7. **setup.md:** Node/pnpm/build as operator steps next to `uv sync`. Doctor fail if dist missing.
8. Grep living docs (not `docs/plans/`) for `vendor_deps`, `static/vendor`, `import map`, `No bundler`, `__MUSICWEB_CONFIG__`, `src/musicweb/static/js` and fix stragglers.

### Verify

- `rg "vendor_deps|unpkg|No bundler|no-bundler|No npm/webpack/vite|__MUSICWEB_CONFIG__|__THEME_COLOR__" AGENTS.md docs --glob '!docs/plans/**'` — no remaining living-doc hits (a past-tense ADR sentence that names the old rule is OK if the rule is clearly replaced).
- `rg "src/musicweb/static/js" docs --glob '!docs/plans/**'` — no living source-of-truth paths left.
- `rg "pnpm --dir frontend" docs/development/commands.md docs/setup.md AGENTS.md` — install, build, dev, test, and Playwright Chromium install are named.
- `rg "doctor" docs/development/commands.md` — frontend dist fail is mentioned.

## Acceptance

- [ ] A new agent reading only living docs would use Vite + pnpm, not `vendor_deps.py`.
- [ ] PWA docs match stage 04 (dist inventory, membership cache-first, `networkFirstManifest` for `/manifest.webmanifest`, no `/static/`-only walker).
- [ ] Commands page lists `pnpm --dir frontend {install,dev,build,test}`, Playwright Chromium install, and doctor’s dist check.
- [ ] This plan directory is not cited as the ADR.
