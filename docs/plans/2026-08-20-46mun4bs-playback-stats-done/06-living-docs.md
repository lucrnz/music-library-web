# Stage 06: Living docs

## Status
done

## Description

Record listen stats as a durable subsystem: what a listen is, where events live, and where the UI is — not this plan directory.

## Rationale

[design.md](context/design.md) is not living documentation. Playback, database, browse-mode, and product pages will otherwise keep saying there is no listen history.

## Invariants

- New owner page: `docs/systems/playback-stats.md`. This plan directory is not cited as the source of truth.
- Do not copy table columns, JSON field names, or encoder argv into docs. Point at source (`db/models.py`, `db/repositories/listens.py`, `routes/listens.py`, `frontend/src/listens/`).
- Do not add a settings-toggle paragraph (there is no toggle). Do not say the Settings gear is hidden.
- Do not describe a pre-encode job as if it exists; one sentence may say events retain profile and play source for later use.
- Do not describe an IndexedDB listens outbox or a `src/musicweb/listens/` package.

## Risks

- None

## Implementation

### Files

- Create: `docs/systems/playback-stats.md`
- Change: `docs/README.md` (link under systems)
- Change: `docs/architecture/index.md` (one overview bullet + core-docs link)
- Change: `docs/database/overview.md` (conceptual area: listen events)
- Change: `docs/systems/playback.md` (pointer: listen counting is not stream HTTP; link the new page)
- Change: `docs/frontend/conventions.md` (Stats browse mode; `frontend/src/listens/`)
- Change: `docs/product/core-guidelines.md` (browse modes include Stats)
- Change: `AGENTS.md` (deep-dive link next to playback)
- Change: `docs/development/project-structure.md` (`db/repositories/listens.py`, `frontend/src/listens/`, `routes/listens.py`)
- Do not change: `docs/systems/diagnostics.md` except if a one-line “listens are not diag events” guardrail is needed — prefer that sentence on the new page only

### Steps

1. Write `docs/systems/playback-stats.md` with: purpose (household most-played + future encode signal); distinguish from index counts (`GET /api/library/stats` / `musicweb stats`); 70% accumulated media time / play cycle; cold-load resume does not credit skipped time; all sinks; localStorage outbox; flush-owned retry (POST is the probe, 204 calls `reportSuccess`, no `HealthWorkSource`); track lookup on ingest; `fromApiTrack` wrap; two empty-state strings; server TZ months; `/stats` chips; always-on; out of scope (toggle, wipe, pre-encode job, per-user, IDB).
2. Add the listens conceptual row to the database overview table (index + listen log, still not the media archive).
3. Extend the product browse-modes sentence: Folders, Artists, Albums, Search, Stats.
4. Playback page: one short paragraph that stream/prepare are not listens, with a link.
5. Architecture overview: mention the listen log next to SQLite index / diagnostics (diagnostics stay JSONL).
6. `AGENTS.md` and `project-structure.md`: point at the new owner files.

### Verify

```sh
# docs only
```

Read the new page against shipped stages 01–05, not against this plan’s file names.

## Acceptance

- [ ] `docs/systems/playback-stats.md` owns the listen contract.
- [ ] Database, playback, frontend, product, architecture, README, `AGENTS.md`, and project-structure point at it or state the new area.
- [ ] This plan is not cited as the source of truth.
- [ ] No fabricated settings toggle, pre-encode worker, IndexedDB outbox, or `src/musicweb/listens/` package in living docs.
