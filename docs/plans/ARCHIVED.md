# Archived plans

Done plan directories removed from `docs/plans/` via git rm. Each entry's command shows that plan's delete commit.

## 2026-08-16-a923d3cj-unit-test-coverage-done

**Title:** Unit test coverage for meaningful components

**Commit:** `bd3ac7b21745124cbbb6ee29878c6bc5d0ab6f6a`

Shipped a hermetic pytest harness (tmp SQLite via the production migrate path) and a dual Vitest node/browser split, then filled unit tests for fingerprint, identity/reattach, job runner, transcode probe, and frontend policy/stores.

A later agent would open the delete commit to recover the coverage inventory and the never-boot / no-ffmpeg / no-coverage-gate boundaries that living docs only summarize.

```bash
git show bd3ac7b21745124cbbb6ee29878c6bc5d0ab6f6a
```

## 2026-08-16-b9ut1p4i-vite-pnpm-vitest-browser-done

**Title:** Vite + pnpm + Vitest browser (initial cutover)

**Commit:** `45ef5c1af6fff2a4bf34e89c73f61ea0c841d844`

Cut the SPA over from no-bundler ESM and vendor_deps onto a frontend/ Vite + pnpm package; FastAPI now serves frontend/dist and refuses to start without it, and PWA inventory walks that dist.

Open the diff to see how Jinja/import-map serving was deleted and how /sw.js fingerprinting was rewritten for hashed assets.

```bash
git show 45ef5c1af6fff2a4bf34e89c73f61ea0c841d844
```

## 2026-08-16-n0sv0eq7-vue-sfc-typescript-done

**Title:** Vue SFC + TypeScript frontend

**Commit:** `76724e2e9ad8a0361dd5d1d42b09580939fb929e`

Converted the Vue 3 SPA from defineComponent JS modules with string templates to <script setup lang="ts"> SFCs under frontend/src/, with vue-tsc as the type gate.

Open the diff for the freeze-and-convert recipe, hand-written API types (no OpenAPI codegen), and the runtime-only Vue / Options-API-off cutover.

```bash
git show 76724e2e9ad8a0361dd5d1d42b09580939fb929e
```

## 2026-08-17-fzzscc2t-mobile-tabs-done

**Title:** Fix mobile tabs

**Commit:** `1503c53c13a682586b97ac1121f842fa5a1a3e37`

Restored single-pane mobile switching by giving LibraryView a real root so .hidden fallthrough lands, made mode chips scroll and light from last library location (including on /queue), and collapsed queue header actions to icons below 900px.

Open the diff to see the fragment-class leak and the ModeBar selection source that must not use raw route.meta.mode on the queue.

```bash
git show 1503c53c13a682586b97ac1121f842fa5a1a3e37
```
