# Stage 07: regen, stats, and doctor commands

## Status
done

## Description

Wire `regen-covers`, `regen-artist-images`, `regen-lyrics` (each with `--force`), plus read-only `stats` and hard-check `doctor`. Regen commands use **`exclusive_maintenance` + `jobs.run_sync(kind=..., force=...)` only** — never call phase functions from Typer.

## Rationale

Completes Phase 1 operator surface with one execution path. Read-only tools work while serve holds the lock.

## Implementation

1. **Regen commands** (flat Typer verbs):
   - `with exclusive_maintenance() as rt: rt.jobs.run_sync(kind="regen-covers"|"regen-artist-images"|"regen-lyrics", force=...)`.
   - Logging + Ctrl+C via runner cancel.
   - Exit codes for success / lock refuse / job failure.
2. **`stats`**: no exclusive lock; bootstrap migrate-if-no-server; repository counts aligned with `/api/library/stats`.
3. **`doctor`** (hard checks; non-zero on hard fail):
   - Library path; data dir writable; ffmpeg deps via `check_dependencies`; DB open with migrate policy.
   - Lock held vs free as **status line** (not necessarily hard fail).
   - Never print secrets.
4. Help text: Phase 1 lock refuse → stop the server (Phase 2 will use control RPC).
