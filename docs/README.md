# Documentation

This documentation is organized by the kind of question you are trying to answer.

## Documentation philosophy

Docs should help a new developer or agent answer:

- What is this part of the system responsible for?
- Where should I look in source for the exact implementation?
- What boundaries and invariants must I preserve?
- How do I change it safely?

Do not copy exact schemas, payload shapes, table columns, profile tags, or route wiring into docs. Those details drift quickly and belong in source. Commands are the deliberate exception because they are essential onboarding surface area; verify exact options in `pyproject.toml`, `.env.example`, and source.

## Start here

- `docs/development/commands.md`: install, run, migrate.
- `docs/development/project-structure.md`: repository layout and ownership boundaries.
- `docs/architecture/index.md`: architecture map and technical decisions.
- `docs/product/core-guidelines.md`: product behavior and audio quality principles.

## Development

- `docs/development/environment.md`: environment variables and config ownership.
- `docs/development/commands.md`: install, run, Alembic CLI.
- `docs/development/project-structure.md`: where code lives and what each package owns.

## Architecture and systems

- `docs/architecture/index.md`: layers, request flow, ownership.
- `docs/architecture/technical-decisions.md`: guiding technical decisions.
- `docs/systems/library-scan.md`: indexing, fingerprints, covers, artist images, lyrics.
- `docs/systems/transcoding.md`: stream profiles, encode policy, cache lifetime.

## Data and UI

- `docs/database/overview.md`: SQLite index purpose and areas.
- `docs/database/migrations.md`: Alembic workflow.
- `docs/frontend/conventions.md`: Vue ESM SPA, stores, routing, vendor assets.

## Strategy

- `docs/documentation-strategy.md`: how documentation is written and kept useful.

## Upkeep

- Update docs when responsibilities, workflows, safety rules, or source-of-truth **file locations** change.
- Do **not** update docs when only code internals change (new fields, renamed helpers, local refactors).
- Prefer updating an existing page over creating a new one.
- Prefer project-specific architecture guidance over copied code examples.
- Keep exact contracts in source and link to the source of truth instead of duplicating them.
- Keep environment docs aligned with `.env.example` and `src/musicweb/config.py`.
- Keep migration docs aligned with `alembic.ini`, `src/musicweb/db/migrations/`, and `AGENTS.md`.
- Strategy guide: `docs/documentation-strategy.md`.
