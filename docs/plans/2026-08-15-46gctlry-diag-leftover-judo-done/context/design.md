> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Diagnostic leftover judo

## Goal

Finish the 023 quality bar: the store owns batch writes, the client outbox has one list and no leftover IDB-peer API, and `/api/stream` emits success once.

## Settled decisions

- **`append_many` is the batch write.** Delete `append(..., rotate=)`. Ingest validates, then calls `append_many`. Single-line `emit` keeps `append` (a one-record wrapper is fine).
- **Keep `ensureHydrated`.** `main.js` stays fire-and-forget `initDiag()`. Delete the empty-check: hydrate always fills into an empty `unacked`.
- **Delete `outboxTrim`.** It trims IDB while ignoring `unacked`. One `dropIds` helper serves ack-delete and cap-delete.
- **Stream:** keep the tight `ensure_stream` `except Exception`. Inline the fail dict into the reject helper. One `http.stream` emit after plan and path are known. Do not wrap the whole handler in bare `Exception`.
- **Living docs:** update the existing `diagnostics.md` sentences so they no longer describe route-level rotate or IDB-as-peer. CLI date-parse regex stays.

## Design

023 fixed the big leaks (one envelope, one outbox list, one `/api` helper, one stream reject path, player seams). The leftovers are orchestration that still looks like the old models.

**Store.** `append_many(directory, records)` takes the lock, writes every line, rotates once, returns the path (or `None` on an empty list, no I/O). `append` is one record through that path. Ingest does not import `maybe_rotate`.

**Outbox.** `unacked` is the only list. Hydrate runs once into that empty list; every writer already waits on the promise, so a “skip if already filled” guard can only hide a bug. IDB is put/delete of those objects. Cap is splice `unacked` then `dropIds`. No function reads IDB to decide what memory should contain after boot except that one hydrate.

**Stream.** Resolve plan and file inside the existing `try`. Encode failure stays a tight inner `except Exception` (reject, re-raise). Then one success emit and one `FileResponse`. Reject helper inlines the catalog fail dict (`profile` / `reason`, no `codec` alias).

## Stage map

Store first so ingest tests stop asserting a `rotate` flag the route should not know. Outbox next (no server dep). Stream emit collapse is independent; after store so media tests stay green. Docs last so the sentences match the three code stages.

1. **`append_many`** — deletes the mode flag; ingest becomes validate + one store call.
2. **Outbox leftovers** — deletes `outboxTrim` and the hydrate empty-check.
3. **Stream one success emit** — independent of 02; keep 023’s one reject path.
4. **Docs** — durable wording only.

## Out of scope

- Awaiting `initDiag()` from `main.js` / deleting `ensureHydrated`.
- New diagnostic events, Errors only / Everything, ingest auth.
- `player.js` / `playerDiag.js`.
- CLI filename regex (date parse only; not a second walker).
- Adding `httpx` / TestClient.
- Rewriting `tail --follow`.

## Assumptions

- Plan 023 is already applied in the working tree. This plan starts from that tree, not from `origin/main`.
- Frontend verification stays manual; no JS test runner.
- One ingest batch is still ≤100 small objects; writing them under one lock is acceptable.
- `emit` still never throws; stream encode failure still re-raises the original exception (not an HTTPException).
