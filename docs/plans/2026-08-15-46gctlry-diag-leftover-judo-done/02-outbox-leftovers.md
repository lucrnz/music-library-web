# Stage 02: Outbox leftovers

## Status
done

## Description

Delete `outboxTrim` and the hydrate empty-check. Give ack-delete and cap-delete one `dropIds` helper. Keep `ensureHydrated` as the wait gate.

## Rationale

`outboxTrim` reads IDB to decide what to drop and ignores `unacked` — the dual-list model 023 deleted. The empty-check is dead if every writer waits, and it can skip restore if something pushes early.

## Invariants

- Cutoff still happens in `emit` before queueing.
- Switching to Errors only does not wipe already-queued Everything rows.
- `emit` still never throws.
- Ingest flush still uses a dedicated `fetch`, not `apiPost`.
- `unacked` remains the list flush and `sendBeacon` read.

## Risks

- Hydrate without the empty-check assumes `unacked` is empty when the fill runs. That holds because every writer awaits `ensureHydrated` first. Do not add a synchronous `unacked.push` elsewhere.

## Implementation

### Files

- Change `src/musicweb/static/js/diag/log.js`
- Change `src/musicweb/static/js/diag/idb.js` (delete `outboxTrim` only)

### Steps

1. `ensureHydrated`: on success, if `rows` is a non-empty array, `unacked.push(...rows)`. No `!unacked.length` guard.
2. Add `dropIds(ids)` — filter numeric ids, `outboxDelete` (fire-and-forget is fine for ack; persist may `await outboxDelete` after a cap splice). `dropRows` splices by object identity then `dropIds`.
3. Cap: if `unacked.length > OUTBOX_MAX`, splice oldest, delete those ids. Do not call or reintroduce an IDB-first trim.
4. Delete `export async function outboxTrim` from `idb.js`.

### Verify

- `rg "outboxTrim" src/musicweb/static/js` — no matches.
- `rg "unacked\\.length" src/musicweb/static/js/diag/log.js` — cap only, not a hydrate skip.
- `rg "canReachServer" src/musicweb/static/js/diag` — still no matches.

## Acceptance

- [ ] `outboxTrim` is gone.
- [ ] Hydrate always fills; it does not skip when `unacked` is non-empty.
- [ ] One helper deletes IDB ids for both ack and cap.
- [ ] `ensureHydrated` remains; `main.js` still calls `initDiag()` without await.
