# Stage 01: Data-dir exclusive lock

## Status
done

## Description

Add an exclusive flock helper under the musicweb data directory so only one **local writer process** owns the data dir: either `serve`, or a CLI maintenance process when no server is running. Read-only CLI commands never hold this lock. No mid-lifetime lock handoff (no pause/resume).

## Rationale

Phase 1 uses the lock to refuse local write jobs while the server is up. Phase 2 keeps that rule for *local* writes; when the server is healthy, write jobs run **inside** the server via UDS and the CLI never takes this lock. Stale lock files after crash are harmless: ownership is the live flock.

## Implementation

1. Package: `src/musicweb/runtime/lock.py` (layout freeze: **`runtime/` + `jobs/` + `control/` + `cli/`**).
2. Lock path: `{musicweb_data_dir}/musicweb.lock`.
3. API:
   - Open/create file; `fcntl.flock` **exclusive, non-blocking**.
   - Handle type and/or context manager: `acquire()` / `release()`; hold the fd while owned.
   - `DataDirLockError` when acquire fails — clear message that another musicweb process holds the data dir.
   - Probe helper for “is exclusive held by someone else?” (try `LOCK_EX|LOCK_NB`, release immediately if acquired). Used by migrate-if-no-server and doctor. Document short race window as acceptable for those uses only.
4. Do not wire into serve/CLI yet; stages 04+ call this.
5. Linux-only is fine for v1.
