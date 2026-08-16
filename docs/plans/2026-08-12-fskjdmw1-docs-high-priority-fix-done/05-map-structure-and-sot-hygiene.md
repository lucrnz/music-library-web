# Stage 05: Map, structure, AGENTS, and Source-of-truth hygiene

## Status
done

## Description

Wire the three new systems pages into `docs/README.md`, `docs/architecture/index.md`, `docs/development/project-structure.md`, and `AGENTS.md`; add a Historical plans note for `docs/plans/`; add missing **Source of truth** sections on durable pages that lack them; fix stale “systems = scan and transcode only” wording.

## Rationale

New pages are invisible without map and agent entrypoints. Architecture and project-structure still describe a server-heavy world and omit PWA/client systems. Done plan trees stay on disk by decision, but the map must say they are historical so they are not mistaken for living design. Strategy-required SoT sections on index/product/structure/commands close the structural audit gap.

## Implementation

1. **`docs/README.md`**
   - List `docs/systems/downloads.md`, `playback.md`, `connectivity.md` under Architecture and systems (one-line each).
   - Add a short **Historical plans** note: `docs/plans/` holds completed multi-stage implementation plans (not living design); durable decisions belong under `docs/systems/`, `docs/frontend/`, etc. Do not enumerate all 26 files.
2. **`docs/architecture/index.md`**
   - Add **Source of truth** (composition root, routes, static SPA entry — high level).
   - Core docs list: include PWA + the three new systems pages.
   - Optionally extend the ASCII diagram or layers table with client OPFS downloads / connectivity as first-class (keep short).
3. **`docs/development/project-structure.md`**
   - Add **Source of truth** pointing at package root / this doc’s scope.
   - Documentation folders: systems includes scan, transcode, PWA, downloads, playback, connectivity (not only scan+transcode).
   - Package layout: mention client downloads, connectivity, and tree only if needed for ownership; do not invent a full SPA inventory.
4. **`AGENTS.md`**
   - Deep dives: add links to the three new systems pages (core client topics).
5. **Missing SoT sections** (strategy structure, not content rewrites):
   - `docs/product/core-guidelines.md` — point at product intent sources and related systems/transcoding pages.
   - `docs/development/commands.md` — point at `pyproject.toml`, `.env.example`, `config.py` as verification sources.
6. **Consistency pass:** fix any relative SoT path style only if you already touch the line; no mass rewrite of library-scan paths required.
7. Out of scope: tree, lyrics, playlists dedicated pages; moving or deleting `docs/plans/*-done/`.
8. Smoke: every new page is reachable from `docs/README.md` and `AGENTS.md`; no broken relative links from the files this stage edits.
