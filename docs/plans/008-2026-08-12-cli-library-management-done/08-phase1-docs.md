# Stage 08: Phase 1 documentation

## Status
done

## Description

Document Phase 1 CLI surface, lock policy, migrate-if-no-server, and package ownership (`runtime/`, `jobs/`, `cli/`). Source remains SoT for exact flags and status JSON.

## Rationale

Operators and agents need durable commands docs before Phase 2 adds `control/`.

## Implementation

1. **`docs/development/commands.md`**: bare/`serve`, `scan`/`--mode`, `scan status`, `regen-*`/`--force`, `stats`, `doctor`. Phase 1: stop server before write jobs; read-only OK while server runs. Ctrl+C cancels local foreground jobs. One-liner that a later release runs jobs via local control socket when server is up.
2. **`docs/development/project-structure.md`**: rows for `cli/`, `runtime/`, `jobs/`; `scan/` = domain phases; job orchestration in `jobs/`.
3. **`docs/systems/library-scan.md`**: single job runner; full scan forces all enrichment phases; regen kinds share the runner.
4. **`AGENTS.md`**: one essentials line pointing at commands.md.
5. Do not document pause/resume. Do not fully specify UDS until stages 09–11.
