# AGENTS.md

Music library web server: FastAPI + SQLite index + Vue 3 SPA (no bundler). Stream lossless libraries with high-fidelity ffmpeg transcoding.

## Essentials

- Entrypoint: `uv run musicweb`
- Package manager / tooling: uv only for Python. No Node/npm build step.
- Browser frontend is plain ESM JavaScript (Vue 3 + Vue Router - no build step).
- Config: `.env` at project root (see `.env.example`); settings load via `musicweb/config.py`.
- Schema migrations: Alembic under `src/musicweb/db/migrations/`; startup applies to head via `musicweb.db.engine`.
- Frontend vendor assets: pinned in `musicweb/vendor_deps.py`; downloaded into `static/vendor/` on startup when the local manifest is stale.

## Hard rules

- Lossless source library - Index packed lossless only. Do not add lossy indexing paths without an explicit product decision.
- High-fidelity transcoding is a primary goal. Prefer transparent encode settings (libsoxr VHQ, correct dither policy) over “good enough” shortcuts. See product audio guidelines.
- Stable track identity comes from content fingerprints, not paths. Renames should reattach when the fingerprint matches.
- Process-temp stream cache is wiped on shutdown; do not treat it as durable storage.
- Migrations: add new Alembic revisions under `src/musicweb/db/migrations/versions/`; do not hand-edit applied history. Startup migrates; optional CLI is `alembic upgrade head`.
- Vendor versions change only in `vendor_deps.py` (version + URL). No npm/webpack/vite.

## Deep dives

- [Documentation map](docs/README.md)
- [Commands](docs/development/commands.md)
- [Project structure](docs/development/project-structure.md)
- [Environment and config](docs/development/environment.md)
- [Architecture](docs/architecture/index.md)
- [Audio quality and product guidelines](docs/product/core-guidelines.md)
- [Database overview](docs/database/overview.md)
- [Migrations](docs/database/migrations.md)
- [Frontend conventions](docs/frontend/conventions.md)
- [Transcoding](docs/systems/transcoding.md)
- [Library scan](docs/systems/library-scan.md)
- [PWA shell](docs/systems/pwa.md)

## Documentation scope

- Source code is the source of truth for exact request/response shapes, table columns, profile tags, route wiring, and encoder argv.
- Documentation explains intent, architecture, ownership boundaries, operating rules, and safe-change workflows.
- Commands are the exception: keep common developer commands documented, but verify options in `pyproject.toml`, `.env.example`, and source.
