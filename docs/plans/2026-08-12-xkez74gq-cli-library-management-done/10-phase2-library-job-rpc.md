# Stage 10: Library job RPC (start / status / cancel)

## Status
done

## Description

Expose the existing **`LibraryJobRunner`** over the control socket: async `start` for scan and regen kinds, `job_status`, `cancel_job`. HTTP library-scan routes remain thin adapters to the **same** runner. No pause/resume, no 503 maintenance mode, no releasing the serve flock.

## Rationale

Job-in-server avoids dual-process writers. Phase 1 already has multi-kind `start`/`run_sync`; this stage only adds a transport.

## Implementation

1. Control methods map 1:1 onto runner:
   - `start_scan` / `start_regen_*` → `jobs.start(kind, **opts)`; busy → structured error (HTTP 409 equivalent).
   - `job_status` → `jobs.status()` (same shape as HTTP).
   - `cancel_job` → `jobs.request_cancel()` for **any** in-flight kind.
2. **Do not** reimplement phases or a second status store in `control/`.
3. Confirm HTTP `POST /api/library/scan`, status, cancel already use the runner (stage 03); adjust only if anything still talks to a legacy scanner API.
4. Serve keeps data-dir flock for process life. CLI using RPC does not take the flock.
5. Scan counters remain scan-only in status payloads for regen kinds.
