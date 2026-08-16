# Stage 11: run_library_job + scan cancel

## Status
done

## Description

Add **`run_library_job` in `musicweb.runtime`** (not under `cli/`): if control `health` is ok, `start` via UDS and poll `job_status` until terminal; else `exclusive_maintenance` + local `jobs.run_sync`. Wire all write Typer commands through it. Add `scan cancel` for remote cancel. Update docs.

## Rationale

End-state UX: serve stays up; CLI is a control client. Local exclusive path remains for offline use. Policy lives in `runtime/`; Typer only parses argv.

## Implementation

1. **`src/musicweb/runtime/run_job.py`** (or `runtime/jobs_client.py`) — `run_library_job(kind, **opts)`:
   - If `control.client.health(data_dir)`:
     - UDS start; on busy, non-zero exit.
     - Poll status until idle/failed/canceled; timeouts on RPCs.
     - Never migrate on this path (server is up).
   - Else:
     - `with exclusive_maintenance(): rt.jobs.run_sync(kind, **opts)`.
2. Wire: `scan`, `regen-covers`, `regen-artist-images`, `regen-lyrics` → only `run_library_job`.
3. Read-only unchanged: `stats`, `doctor`, `scan status`.
4. **`scan cancel`**: health ok → `cancel_job`; else message that remote cancel needs a live server (local jobs: Ctrl+C).
5. Docs: server-up uses control socket; lock refuse when lock held but health fails (degraded). No pause/503 language.
6. Out of scope: pause/resume, PIDs, re-spawn, per-id regen, Windows non-UDS.
