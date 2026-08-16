# Stage 02: One client outbox

## Status
done

## Description

Replace the IDB-or-memory dual flush with one `unacked` list that flush and `sendBeacon` both read. IDB only persists that list. Delete `canReachServer` from `log.js` and delete the unused id getters.

## Rationale

The hide path this feature exists for is a no-op when IDB opened (`beaconFlush` only saw memory). The connectivity import is a cycle that only skipped a POST.

## Invariants

- Cutoff still happens in `emit` before anything is queued (`error` always; other levels only in Everything).
- Switching Errors only does **not** wipe already-queued Everything rows.
- `emit` still never throws.
- Ingest flush still does not use `apiPost`.

## Risks

- Flush without a reachability gate will POST while `server_down` and leave rows (same as a failed POST today). Accept.
- Hydrate-from-IDB on boot can duplicate if `unacked` was also filled this session — hydrate only when `unacked` is empty, or hydrate-then-replace `unacked` at `initDiag` before any emit except after hydrate.

## Implementation

### Files

- Change `src/musicweb/static/js/diag/log.js`
- Change `src/musicweb/static/js/diag/idb.js` only if the put/all/delete API needs a “replace all unacked” helper (prefer keep put/delete)
- Do **not** change `connectivity.js` except that the cycle is gone from `log.js`

### Steps

1. `unacked` is an array of ingest-shaped records (optional local `id` after IDB put).
2. `initDiag`: `outboxAll()` → `unacked = rows` (or mapped), then cookies/boot emit/flush.
3. `emit`: if cutoff fails, return. Push onto `unacked`. `outboxPut` when IDB works; store returned id on the row. Trim `unacked` and IDB to 500 (oldest first).
4. `flushOutbox`: no `canReachServer`. POST batches from `unacked`. On ok, splice those rows and `outboxDelete` their ids. On failure, stop and keep rows.
5. `beaconFlush`: `sendBeacon` current `unacked` (≤100). If the browser reports success, drop those rows and delete ids (best-effort). Same list as flush — **not** a second buffer.
6. Delete `getMode`, `getClientId`, `getSessionId`, `getPlayId`.
7. Delete `import { canReachServer } from "../connectivity.js"`.

### Verify

- `rg "canReachServer" src/musicweb/static/js/diag` — no matches.
- `rg "export function get(Mode|ClientId|SessionId|PlayId)" src/musicweb/static/js/diag/log.js` — no matches.
- `rg "from \"./diag/log.js\"" src/musicweb/static/js/connectivity.js` — still imports `emit` only.
- Manual: Errors only, force an error, DevTools offline, hide tab, go online, reload — error row eventually appears in JSONL (at-least-once). Everything + hide still beacons.

## Acceptance

- [ ] One list feeds flush and beacon.
- [ ] `log.js` does not import connectivity.
- [ ] Unused getters are gone.
- [ ] Cutoff and ingest-dedicated fetch unchanged.
