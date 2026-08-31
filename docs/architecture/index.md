# Architecture index

Architecture-specific docs map. For the full documentation map, see `docs/README.md`.

## Source of truth

- App composition / lifespan: `src/musicweb/main.py`
- HTTP surface: `src/musicweb/routes/`
- SPA entry: `frontend/src/main.ts`
- Full documentation map: `docs/README.md`

## Overview

Musicweb is a single-process LAN server:

1. **Filesystem library** — media files under a configured root; layout-agnostic discovery.
2. **SQLite index** — artists, albums, tracks, playlists, FTS5 search; durable under the data directory.
3. **HTTP API + SPA** — FastAPI JSON API and a Vue 3 SFC + TypeScript client built by Vite; FastAPI serves `frontend/dist`.
4. **On-demand transcoder** — ffmpeg worker produces Opus/FLAC stream profiles into a process-temp cache.
5. **Client offline path** — optional Downloads (OPFS on Android / leftover, companion disk on an installed desktop PWA), connectivity, and play-source resolution.
6. **Household radio** — one process-lifetime station clock; tuners drive `Transcoder` prepare of the current track (not a second encoder). See `docs/systems/radio.md`.
7. **Diagnostics** — structured client/server events as JSONL under the data dir; Settings cutoff + `musicweb logs`. See `docs/systems/diagnostics.md`.

```text
Browser (Vue SFC + TypeScript SPA)
    │  REST + media GETs
    ├── Offline: Downloads (OPFS or companion disk + IndexedDB)
    └── Connectivity + quality prefs (client)
    ▼
FastAPI (routes → services)
    ├── Library (safe path I/O)
    ├── DB / repositories / FTS
    ├── Library jobs (background thread)
    ├── Cover / artist-image stores
    ├── Radio station (clock + picker; tuners enqueue Transcoder)
    └── Transcoder (ffmpeg worker)
            │
            ▼
      Process-temp streams/ (deleted on exit and after about an hour idle)
```

## Core docs

- `docs/architecture/technical-decisions.md`: guiding technical decisions.
- `docs/systems/library-scan.md`: indexing pipeline and identity.
- `docs/systems/transcoding.md`: profiles, encode policy, cache.
- `docs/systems/pwa.md`: installable shell and service worker scope.
- `docs/systems/downloads.md`: client offline catalog (OPFS or companion disk).
- `docs/systems/companion.md`: loopback sidecar (hog + blob store).
- `docs/systems/playback.md`: play source, quality prefs, prepare.
- `docs/systems/radio.md`: household station (encode + seek).
- `docs/systems/connectivity.md`: reachability.
- `docs/database/overview.md`: what the index represents.
- `docs/frontend/conventions.md`: client architecture.
- `docs/product/core-guidelines.md`: UX and audio quality product rules.

## Layers

| Layer | Owns | Does not own |
|-------|------|--------------|
| `routes/` | HTTP parse, status codes, thin orchestration | Encode policy, SQL details, filesystem presence |
| `scan/` | Walk, fingerprint, upsert, enrichment passes, `jobs.py` scan/regen functions | Serving HTTP |
| `library.py` | Path jail (`resolve`) and present indexable audio (`present_audio`) | Encode policy, index writes |
| `db/` | Models, sessions, FTS, migrations, repositories | Filesystem media I/O |
| `transcode/` | Profiles, probe, worker, dependency checks, shared enqueue | Persistent media storage |
| `radio/` | Station clock, picker, tuner-driven prepare | Live encode pipe, stream-cache forget (retain hook only) |
| `frontend/src/` | UI state, playback, connectivity, offline downloads (OPFS or companion disk) | Server-side index writes |

Composition root is `main.create_app`: settings, database, library, stores, jobs, process cache, and transcoder are attached to `app.state` for route deps.

## Documentation upkeep

- Update docs when responsibilities, workflows, safety rules, or source-of-truth **file locations** change.
- Do **not** update docs when only code internals change — that is the domain of source.
- Prefer project-specific architecture guidance over copied code examples.
- Keep exact API shapes in `routes/` and models in `db/models.py`; docs link instead of duplicating.
