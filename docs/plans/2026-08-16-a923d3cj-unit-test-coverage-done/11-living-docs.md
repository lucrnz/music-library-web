# Stage 11: Living testing docs

## Status
done

## Description

Write `docs/development/testing.md` and point existing onboarding docs at it. Record what we test, how to run it, and what we never boot. This plan directory is not the ADR.

## Rationale

`docs/documentation-strategy.md` already names “testing strategy” as a development topic, and `project-structure.md` still says smoke coverage starts with package importability. After stages 01–10 that sentence is false.

## Invariants

- Document decisions and commands, not every test function or assertion.
- Do not publish a coverage percentage or add a fail-under.
- Do not treat `docs/plans/` as living design.
- Verify command flags against `pyproject.toml` and `frontend/package.json`.

## Risks

- Over-listing modules will rot. Point at `tests/` and `frontend/tests/` layout plus the never-boot list instead of copying the inventory tables.

## Implementation

### Files

- Create: `docs/development/testing.md`
- Edit: `docs/development/commands.md`
- Edit: `docs/development/project-structure.md`
- Edit: `docs/README.md`
- Edit: `AGENTS.md` (one Deep-dives bullet)

### Steps

1. **`docs/development/testing.md`** with: title/overview; source of truth (`tests/`, `frontend/tests/`, `tests/conftest.py`, `frontend/vitest.config.ts`); what “meaningful” means (heavy logic, not Vue chrome); how to run (`uv run --group dev pytest`, `pnpm --dir frontend test` / `typecheck`); backend layout (existing flat `tests/test_*.py` stay; new files under `tests/<package>/`); frontend dual projects (node vs `tests/browser`); tmp SQLite via `init_database`; never-boot list (`create_app`, ffmpeg encode, real network, Core Audio, developer `data/`); tiny-seam rule; no coverage reporter / no CI. Follow the required sections style of other `docs/development/` pages. Do not link `docs/plans/` as living design.
2. **commands.md:** in the Test section, say pytest covers the inventory under `tests/` (not “smoke import only”) and that Vitest runs node units + Chromium Icon smoke. Link to `testing.md`. Keep the same commands.
3. **project-structure.md:** replace “smoke coverage starts with package importability” with a pointer to `tests/` + `docs/development/testing.md`. Mention `frontend/tests/` the same way.
4. **docs/README.md:** add `docs/development/testing.md` under Development.
5. **AGENTS.md:** add a Deep-dives link to `docs/development/testing.md`. Do not add coverage rules to Hard rules.

### Verify

- Every new/changed doc uses the project’s source-of-truth / no-schema-copy conventions.
- Commands in `testing.md` match `docs/development/commands.md` and the real tool configs.
- `rg "smoke coverage starts with package importability" docs` has no hits.

## Acceptance

- [ ] `docs/development/testing.md` exists and states the never-boot list and dual Vitest projects.
- [ ] commands, project-structure, docs map, and AGENTS.md point at it.
- [ ] No coverage percentage or CI workflow was introduced.
- [ ] This plan directory is not linked as living design.
