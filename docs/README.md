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

- `docs/setup.md`: operator on-ramp (prerequisites, configure, run, PWA notes).
- `docs/development/commands.md`: install, run, library CLI, migrate.
- `docs/development/project-structure.md`: repository layout and ownership boundaries.
- `docs/architecture/index.md`: architecture map and technical decisions.
- `docs/product/core-guidelines.md`: product behavior and audio quality principles.

## Development

- `docs/development/environment.md`: environment variables and config ownership.
- `docs/development/commands.md`: install, run, Alembic CLI.
- `docs/development/project-structure.md`: where code lives and what each package owns.
- `docs/development/testing.md`: pytest and Vitest — what we test, how to run, what we never boot.

## Architecture and systems

- `docs/architecture/index.md`: layers, request flow, ownership.
- `docs/architecture/technical-decisions.md`: guiding technical decisions.
- `docs/systems/library-scan.md`: indexing, fingerprints, covers, artist images, lyrics.
- `docs/systems/transcoding.md`: stream profiles, encode policy, cache lifetime.
- `docs/systems/pwa.md`: installable shell, service worker scope, public origin.
- `docs/systems/downloads.md`: client offline catalog (OPFS), queue, import surface.
- `docs/systems/playback.md`: play source, quality prefs, prepare.
- `docs/systems/radio.md`: household 24/7 station (encode + seek, not a live pipe).
- `docs/systems/playback-stats.md`: household listen log and Stats browse mode.
- `docs/systems/exclusive-audio.md`: operator get started (Mac), then design (companion hog, mpv, loopback WS).
- `docs/systems/connectivity.md`: online / offline / server_down.
- `docs/systems/diagnostics.md`: client/server event capture, Errors only vs Everything, `musicweb logs`.

## Data and UI

- `docs/database/overview.md`: SQLite index purpose and areas.
- `docs/database/migrations.md`: Alembic workflow.
- `docs/frontend/conventions.md`: Vue ESM SPA (Vite + pnpm), stores, routing.

## Strategy

- `docs/documentation-strategy.md`: how documentation is written and kept useful.

## Historical plans

`docs/plans/` holds in-flight multi-stage implementation plans. Directory names are `{YYYY-MM-DD}-{id}-{slug}-pending`. They are **not** living design docs. Finished plans are removed from the tree with `git rm` and remain in git history as `*-done`. Durable decisions belong under `docs/systems/`, `docs/frontend/`, `docs/architecture/`, and related pages. Prefer those over reading old stage files when changing the product.

## Upkeep

- Update docs when responsibilities, workflows, safety rules, or source-of-truth **file locations** change.
- Do **not** update docs when only code internals change (new fields, renamed helpers, local refactors).
- Prefer updating an existing page over creating a new one.
- Prefer project-specific architecture guidance over copied code examples.
- Keep exact contracts in source and link to the source of truth instead of duplicating them.
- Keep environment docs aligned with `.env.example` and `src/musicweb/config.py`.
- Keep migration docs aligned with `alembic.ini`, `src/musicweb/db/migrations/`, and `AGENTS.md`.
- Strategy guide: `docs/documentation-strategy.md`.
