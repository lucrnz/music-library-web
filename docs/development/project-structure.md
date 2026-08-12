# Project structure

FastAPI server that indexes a lossless music tree into SQLite and serves a Vue 3 ESM SPA plus on-demand transcoded streams.

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

## Package layout (`src/musicweb`)

| Area | Responsibility |
|------|----------------|
| `main.py` | FastAPI app factory, lifespan, static mount, SPA shell wiring |
| `cli/` | Typer entry (`serve`, `scan`, regen, `stats`, `doctor`); argv only |
| `runtime/` | Data-dir flock, bootstrap, exclusive maintenance, `run_library_job` |
| `jobs/` | Single-flight library job runner (scan + regen kinds, ScanState) |
| `control/` | Private UDS JSON control plane (health + job RPC) for live CLI |
| `config.py` | Settings from env + source-level tuning constants |
| `library.py` | Safe path resolution under `MUSIC_LIBRARY_PATH` |
| `metadata.py` | Tag / audio tech reading (mutagen) |
| `cache.py` | Process-scoped temp caches (streams) |
| `cover.py` / `artist_image.py` | Persisted WebP cover and portrait stores under the data dir |
| `http_client.py` | Shared HTTP client helpers for outbound fetch |
| `vendor_deps.py` | Pinned frontend vendor registry + download-on-startup |
| `db/` | Engine, models, FTS helpers, repositories, Alembic migrations |
| `scan/` | Walk, fingerprint, batch upsert, covers, artist images, lyrics, finalize (phases only) |
| `transcode/` | Dependency check, profiles, probe, encode worker |
| `lyrics/` | Local + LRCLIB lyrics fetch/parse |
| `artist_images/` | Local + MusicBrainz / Last.fm / fanart.tv portrait cascade |
| `images/` | WebP render/store helpers |
| `routes/` | HTTP API routers (health, scan, discovery, folders, media, playlists) + SPA pages |
| `static/` | CSS, JS SPA, images; `vendor/` is gitignored (fetched at runtime) |
| `static/js/downloads/` | Client offline catalog (OPFS + IndexedDB); see `docs/systems/downloads.md` |
| `static/js/connectivity.js` (+ store / UI binders) | Reachability and health signals; see `docs/systems/connectivity.md` |
| `templates/` | Jinja shell (`index.html`) with import map |

## Ownership rules

- **HTTP surface** lives under `routes/`. Aggregate router is `routes/api.py`; page/SPA fallback is `routes/pages.py`.
- **Index writes** go through `jobs/` (orchestration) + `scan/` phases + repositories — routes and CLI must not invent parallel SQL paths or call enrichment phases directly.
- **ORM models** live in `db/models.py`; query helpers in `db/repositories/`.
- **Stream encode policy** (profiles, aresample/dither rules) lives under `transcode/`. Do not reimplement encode argv in routes.
- **Settings secrets and paths** are env-driven; fetch intervals and feature toggles for artist images / lyrics are source constants in `config.py`.
- **Frontend** is no-bundler ESM under `static/js/`. Stores hold client state; components render; `api.js` talks to the server.
- **Offline downloads** stay under `static/js/downloads/` and must not write the server index.
- Add feature code near its owner package before introducing shared abstractions.

## Documentation folders

- `docs/README.md`: documentation map.
- `docs/architecture/`: system design and technical decisions.
- `docs/database/`: index purpose and migrations.
- `docs/development/`: commands, environment, structure.
- `docs/frontend/`: SPA conventions.
- `docs/product/`: product and audio guidelines.
- `docs/systems/`: cross-cutting design (scan, transcode, PWA, downloads, playback, connectivity).
- `docs/plans/`: historical multi-stage implementation plans (not living design).
