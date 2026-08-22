# AGENTS.md

Music library web server: FastAPI + SQLite index + Vue 3 SPA (Vite + pnpm). Stream a lossless-first library with high-fidelity ffmpeg transcoding.

## Essentials

- Entrypoint: `uv run musicweb` (bare = serve; also `scan`, `regen-*`, `stats`, `doctor` — see `docs/development/commands.md`). Requires a built SPA: `pnpm --dir frontend build`.
- Tooling: uv for Python; pnpm for the frontend (`pnpm --dir frontend {install,dev,build,typecheck,test}`). No root `package.json`.
- Browser frontend is Vue 3 SFC (`<script setup lang="ts">`) plus TypeScript modules under `frontend/src/`. Typecheck with `pnpm --dir frontend typecheck` (`vue-tsc`).
- Config: `.env` at project root (see `.env.example`); settings load via `musicweb/config.py`.
- Schema migrations: Alembic under `src/musicweb/db/migrations/`; startup applies to head via `musicweb.db.engine`.
- Frontend deps change only in `frontend/package.json`. Commit `frontend/pnpm-lock.yaml`. Do not commit `frontend/dist`.

## Hard rules

- Lossless-first library — index packed lossless by default. MP3/AAC are opt-in (`MUSICWEB_INDEX_LOSSY`), always marked, and streamed/downloaded as stored (on-demand and radio). Do not add other lossy formats or a lossy transcode path without a new product decision.
- When stopping a development server, NEVER kill it, stop it safely instead
- **ffprobe** is a hard startup and `musicweb doctor` requirement (next to ffmpeg).
- High-fidelity transcoding is a primary goal. Prefer transparent encode settings (libsoxr VHQ, correct dither policy) over “good enough” shortcuts. See product audio guidelines.
- Stable track identity comes from content fingerprints, not paths. Renames should reattach when the fingerprint matches.
- Process-temp stream cache is wiped on shutdown and after about an hour with no HTTP client; do not treat it as durable storage.
- Migrations: add new Alembic revisions under `src/musicweb/db/migrations/versions/`; do not hand-edit applied history. Startup migrates; optional CLI is `alembic upgrade head`.
- Frontend versions change only in `frontend/package.json`. Do not add a second bundler or generate the service worker in Node without a new decision.

## Deep dives

- [Documentation map](docs/README.md)
- [Setup (operator on-ramp)](docs/setup.md)
- [Commands](docs/development/commands.md)
- [Project structure](docs/development/project-structure.md)
- [Testing](docs/development/testing.md)
- [Environment and config](docs/development/environment.md)
- [Architecture](docs/architecture/index.md)
- [Audio quality and product guidelines](docs/product/core-guidelines.md)
- [Database overview](docs/database/overview.md)
- [Migrations](docs/database/migrations.md)
- [Frontend conventions](docs/frontend/conventions.md)
- [Transcoding](docs/systems/transcoding.md)
- [Library scan](docs/systems/library-scan.md) — preferred artist files under `covers/artists-preferred/` are sacred to scan
- [PWA shell](docs/systems/pwa.md)
- [Offline downloads](docs/systems/downloads.md)
- [Playback and quality](docs/systems/playback.md)
- [Household radio](docs/systems/radio.md)
- [Playback stats](docs/systems/playback-stats.md)
- [Connectivity](docs/systems/connectivity.md)
- [Diagnostics](docs/systems/diagnostics.md)

## Documentation scope

- Source code is the source of truth for exact request/response shapes, table columns, profile tags, route wiring, and encoder argv.
- Documentation explains intent, architecture, ownership boundaries, operating rules, and safe-change workflows.
- Commands are the exception: keep common developer commands documented, but verify options in `pyproject.toml`, `.env.example`, and source.
