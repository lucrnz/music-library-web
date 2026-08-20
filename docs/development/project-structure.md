# Project structure

FastAPI server that indexes a lossless-first music tree into SQLite and serves a Vite-built Vue 3 ESM SPA plus on-demand transcoded streams (lossy originals pass through when opted in).

## Source of truth

- Application package layout: `src/musicweb/`
- Console entry and dependencies: `pyproject.toml`
- Documentation map: `docs/README.md`
- Agent operating rules: `AGENTS.md`

This page describes **ownership boundaries** — where code lives and what each area owns. Exact APIs and schemas stay in source.

## Root

- `pyproject.toml`: package metadata, dependencies, `musicweb` console script.
- `alembic.ini`: optional Alembic CLI config (runtime migrations run from the app).
- `.env.example` / `.env`: environment configuration (secrets and paths).
- `data/`: local runtime data (`library.db`, `covers/`); ignored from source control.
- `docs/`: project documentation.
- `AGENTS.md`: short agent/human operating rules.
- `src/musicweb/`: application package.
- `frontend/`: Vite + pnpm Vue SPA (source); `frontend/dist/` is gitignored build output.
- `tests/`: pytest (existing `test_*.py` plus `tests/<package>/`). Frontend tests: `frontend/tests/`. How to run and what we never boot: `docs/development/testing.md`.

## Package layout (`src/musicweb`)

| Area | Responsibility |
|------|----------------|
| `main.py` | FastAPI app factory, lifespan, dist mounts, SPA shell wiring |
| `cli/` | Typer entry (`serve`, `scan`, regen, `stats`, `doctor`, `exclusive-audio`, `logs`); argv only |
| `diag/` | Diagnostic JSONL store, emit, join-key reader |
| `exclusive/` | macOS exclusive-audio companion (loopback WS + mpv); no DB/lock |
| `runtime/` | Data-dir flock, bootstrap, exclusive maintenance, `run_library_job` |
| `jobs/` | Single-flight library job runner (scan + regen kinds, ScanState) |
| `control/` | Private UDS JSON control plane (health + job RPC) for live CLI |
| `config.py` | Settings from env + source-level tuning constants |
| `library.py` | Safe path resolution under `MUSIC_LIBRARY_PATH` |
| `metadata.py` | Tag / audio tech reading (mutagen) |
| `cache.py` | Process-scoped temp caches (streams) |
| `cover.py` / `artist_image.py` | Persisted WebP cover and portrait stores under the data dir |
| `http_client.py` | Shared HTTP client helpers for outbound fetch |
| `pwa_shell.py` | Dist path, inventory walk, SW render, theme/manifest chrome constants |
| `sw.template.js` | Service worker template (Python-injected precache list) |
| `db/` | Engine, models, FTS helpers, repositories, Alembic migrations |
| `scan/` | Walk, fingerprint, batch upsert, covers, artist images, lyrics, finalize (phases only) |
| `transcode/` | Dependency check, profiles, probe, encode worker, idle stream-cache eviction |
| `lyrics/` | Local + LRCLIB lyrics fetch/parse |
| `artist_images/` | Local + MusicBrainz / Last.fm / fanart.tv portrait cascade |
| `images/` | WebP render/store helpers |
| `routes/` | HTTP API routers (health, scan, discovery, folders, media, playlists, listens, diag) + SPA pages |

## Ownership rules

- **HTTP surface** lives under `routes/`. Aggregate router is `routes/api.py`; page/SPA fallback is `routes/pages.py`.
- **Index writes** go through `jobs/` (orchestration) + `scan/` phases + repositories — routes and CLI must not invent parallel SQL paths or call enrichment phases directly.
- **ORM models** live in `db/models.py`; query helpers in `db/repositories/` (including `listens.py`).
- **Listen stats** HTTP is `routes/listens.py`; client cycle/outbox/chips are `frontend/src/listens/`. See `docs/systems/playback-stats.md`. Do not add `src/musicweb/listens/`.
- **Stream encode policy** (profiles, aresample/dither rules) lives under `transcode/`. Do not reimplement encode argv in routes.
- **Settings secrets and paths** are env-driven; fetch intervals and feature toggles for artist images / lyrics are source constants in `config.py`.
- **Frontend** is Vite Vue SFC + TypeScript under `frontend/src/`. Stores hold client state; components render; `api.ts` talks to the server. FastAPI serves `frontend/dist`.
- **Row action menus** live under `frontend/src/components/menu/`. Desktop media queries for new client code live in `frontend/src/layout.ts`. See `docs/frontend/conventions.md`.
- **Offline downloads** stay under `frontend/src/downloads/` and must not write the server index.
- Add feature code near its owner package before introducing shared abstractions.

## Documentation folders

- `docs/README.md`: documentation map.
- `docs/architecture/`: system design and technical decisions.
- `docs/database/`: index purpose and migrations.
- `docs/development/`: commands, environment, structure.
- `docs/frontend/`: SPA conventions.
- `docs/product/`: product and audio guidelines.
- `docs/systems/`: cross-cutting design (scan, transcode, PWA, downloads, playback, playback-stats, connectivity).
- `docs/plans/`: in-flight multi-stage plans (`*-pending` only). Finished plans live in git history.
