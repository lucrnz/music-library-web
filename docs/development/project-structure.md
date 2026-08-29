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
| `cli/` | Typer entry (`serve`, `scan`, regen, `stats`, `doctor`, `companion`, `logs`, `radio`); argv only |
| `diag/` | Diagnostic JSONL store, emit, join-key reader |
| `exclusive/` | Desktop companion (loopback WS + mpv hog + blob store + `optical_session` + WAV); no library DB/lock |
| `cd/` | MusicBrainz disc-id lookup, confirm bind/half-bind, `cd_identities` snapshot |
| `runtime/` | Data-dir flock, bootstrap, exclusive maintenance, `run_library_job` |
| `jobs/` | Single-flight library job runner (`ScanState`, `_begin`, `_begin_phase`; scan finish stamps radio watermark). Kind dispatch calls `scan/jobs.py` (`run_scan` / `regen_*`) |
| `control/` | Private UDS JSON control plane (health, job RPC, live radio debug RPC) for live CLI |
| `config.py` | Settings from env + source-level tuning constants |
| `library.py` | Path jail (`resolve`) and present indexable audio (`present_audio`) under `MUSIC_LIBRARY_PATH` |
| `metadata.py` | Tag / audio tech reading (mutagen) |
| `cache.py` | Process-scoped temp caches (streams) |
| `cover.py` | Album cover extract (`CoverStore`); has/path live on `WebpAssetStore` |
| `images/` | WebP render/store helpers (`WebpAssetStore`; scanned portraits at `covers/artists/`) |
| `timeutil.py` | Shared UTC ISO helpers (`utc_now_iso`, `format_iso_utc`, `parse_iso_utc`) |
| `http_client.py` | Shared HTTP client helpers for outbound fetch |
| `pwa_shell.py` | Dist path, inventory walk, SW render, theme/manifest chrome constants |
| `sw.template.js` | Service worker template (Python-injected precache list) |
| `db/` | Engine, models, FTS helpers, repositories, Alembic migrations |
| `scan/` | Walk, `index_phase.py` (`run_index`), `jobs.py` (`run_scan` / `regen_*`), fingerprint, batch upsert (shared metadata cache with siblings), covers, artist images, lyrics, finalize; shared enrichment loop in `enrichment.py` |
| `transcode/` | Dependency check (ffmpeg + ffprobe), profiles, probe, encode worker, shared `enqueue_prepare`, idle stream-cache eviction |
| `radio/` | Household station clock, picker, tuner prepare (reuses Transcoder); snapshot serialize lives on `routes/radio.py` |
| `lyrics/` | Local + LRCLIB lyrics fetch/parse |
| `artist_images/` | Local + MusicBrainz / Last.fm / fanart.tv portrait cascade |
| `routes/` | HTTP API routers (health, scan, discovery, `media.py` stream/cover, `artist_images.py` portraits, playlists, listens, radio, cd, diag) + SPA pages |

## Ownership rules

- **HTTP surface** lives under `routes/`. Aggregate router is `routes/api.py`; page/SPA fallback is `routes/pages.py`.
- **Index writes** go through `jobs/` (orchestration) + `scan/` phases + repositories — routes and CLI must not invent parallel SQL paths or call enrichment phases directly.
- **ORM models** live in `db/models.py`; query helpers in `db/repositories/` (including `listens.py`).
- **Listen stats** HTTP is `routes/listens.py`; client cycle/outbox/chips are `frontend/src/listens/`. See `docs/systems/playback-stats.md`. Do not add `src/musicweb/listens/`.
- **Stream encode policy** (profiles, aresample/dither rules) lives under `transcode/`. Do not reimplement encode argv in routes.
- **Present audio files** go through `Library.present_audio` (jail + exists + indexable). Stream maps `None` to 404. Enqueue, radio, scan lyrics/covers, and local artist-image folder lookup branch on `None`. Do not reimplement resolve-and-exists at those call sites. `resolve` stays for path jail used by `present_audio`.
- **Settings secrets and paths** are env-driven; fetch intervals and feature toggles for artist images / lyrics are source constants in `config.py`.
- **Frontend** is Vite Vue SFC + TypeScript under `frontend/src/`. Stores hold client state; components render; `api.ts` talks to the server. FastAPI serves `frontend/dist`.
- **Library browse** is a `BrowseSource` (`components/library/sources/`) plus `entityActionsFor` consumed by `LibraryView` and `LibraryTreePane`. The source owns list load, tree `loadRoots` / `loadChildren`, `flags` / `chrome` / `cover`, and tree title / empty / focus / reload; the tree pane does not switch on mode for those jobs.
- **Playback session** is `frontend/src/playback/session.ts` (`become`, including `cd`). Load/fail is `frontend/src/playback/load.ts`. CD cursor + prefs are `frontend/src/stores/cd.ts`; CD chrome is `frontend/src/components/cd/`; CD load is `frontend/src/playback/cdLoad.ts`. Radio socket is `frontend/src/radio/runtime.ts`; face/load and Media Session are `frontend/src/radio/session.ts`; `stores/radio.ts` is the chrome face. Stream-cache forget retain is lifespan `app.state.retain_stream_ids` + `routes/deps.retain_stream_ids` (not `media.py` → station). Exclusive companion commands are a module-level `COMMANDS` table + `_with_live` in `exclusive/session.py`.
- **Row action menus** live under `frontend/src/components/menu/`. Desktop media queries for new client code live in `frontend/src/layout.ts`. See `docs/frontend/conventions.md`.
- **Offline downloads** stay under `frontend/src/downloads/` (`snapshot.ts` catalog view, `queueRuntime.ts` pump + abort; `queue.ts` does not import runtime) and must not write the server index.
- Add feature code near its owner package before introducing shared abstractions.

## Documentation folders

- `docs/README.md`: documentation map.
- `docs/architecture/`: system design and technical decisions.
- `docs/database/`: index purpose and migrations.
- `docs/development/`: commands, environment, structure.
- `docs/frontend/`: SPA conventions.
- `docs/product/`: product and audio guidelines.
- `docs/systems/`: cross-cutting design (scan, transcode, radio, PWA, downloads, playback, playback-stats, connectivity, CD playback).
- `docs/plans/`: in-flight multi-stage plans (`*-pending` only). Finished plans live in git history.
