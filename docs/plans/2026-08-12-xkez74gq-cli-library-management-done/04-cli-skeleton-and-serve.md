# Stage 04: CLI skeleton and serve

## Status
done

## Description

Introduce Typer under `musicweb.cli`: bare `musicweb` and `musicweb serve` start the server; acquire the data-dir exclusive lock for the process lifetime; fail if the lock is held. Wire entrypoints and the `typer` dependency.

## Rationale

All subcommands hang off one app. Serve owns the flock so Phase 1 local writers detect a live server. Explicit `serve` keeps scripts clear; zero-arg launch stays the common path.

## Implementation

1. Add `typer` to `pyproject.toml` / lockfile.
2. Layout:
   - `src/musicweb/cli/app.py` — root Typer app
   - `src/musicweb/cli/serve.py` — serve implementation
   - Accept-loop for UDS is **not** under `cli/` (`control/` in Phase 2).
3. Entry: `musicweb:main` and `python -m musicweb` → Typer; no subcommand → same as `serve`.
4. Serve path:
   - Configure logging (INFO, existing format).
   - Load settings; **acquire exclusive lock** in a **`try` / `finally`** (or equivalent) so failed bootstrap/migrate after acquire still releases the lock on clean failure paths.
   - Bootstrap / `create_app` (migrate always for serve).
   - `uvicorn.run` from settings listen/port only (no host/port CLI flags).
   - Process exit releases flock.
5. Move CLI-only uvicorn launch out of `main.py`; keep FastAPI factory + lifespan there.
6. Do not ship empty stub commands for scan/regen.
