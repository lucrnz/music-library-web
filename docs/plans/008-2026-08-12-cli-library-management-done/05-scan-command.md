# Stage 05: scan command, scan status, exclusive_maintenance

## Status
done

## Description

Add Typer group `scan` (default callback = local scan; `scan status` = read-only). Introduce **`exclusive_maintenance()`** as the Phase 1 **local-only** write primitive: exclusive flock + bootstrap (migrate-if-no-server). All local write work runs via **`jobs` runner `run_sync`**, not ad-hoc phase calls. Phase 2 will add **`run_library_job`** in `runtime/` that does health→RPC else this primitive — do not overload `exclusive_maintenance` with RPC.

## Rationale

One local write context prevents lock/bootstrap copy-paste. Job runner keeps status and cancel consistent with HTTP.

## Implementation

1. **`exclusive_maintenance`** in `src/musicweb/runtime/maintenance.py`:
   - Acquire exclusive flock (fail → clear “stop the server / another writer” message).
   - Bootstrap with migrate-if-no-server.
   - Yield `RuntimeServices` (includes `jobs` runner).
   - Release lock + teardown on exit.
2. **`musicweb scan`**
   - `--mode quick|full` (default `quick`).
   - `with exclusive_maintenance() as rt: rt.jobs.run_sync(kind="scan", mode=...)`.
   - Exit codes: 0 success; non-zero failure / lock refuse.
   - Logging so greppable job/scan lines hit stderr.
   - Ctrl+C → runner cooperative cancel.
3. **`musicweb scan status`**
   - No exclusive lock; bootstrap read path (migrate-if-no-server).
   - Print `rt.jobs.status()` (same shape as HTTP).
4. Omit `scan cancel` until stage 11.
5. Document in module docstring: Phase 2 `runtime.run_library_job` wraps health→UDS else `exclusive_maintenance` + `run_sync`.
