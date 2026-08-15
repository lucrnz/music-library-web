# Stage 01: append_many

## Status
done

## Description

Add `append_many` as the only JSONL write+rotate path. Make `append` a one-record wrapper. Point ingest at `append_many`. Delete the `rotate` flag.

## Rationale

`rotate=False` plus a route-level `maybe_rotate` is a mode flag and a half-applied batch. The store should own “write these lines, rotate once.”

## Invariants

- Envelope keys and ingest `source="client"` (no `emit` call) stay the same.
- `emit` still uses `append` for one record.
- `maybe_rotate` still never deletes the only remaining day file.
- A failing validate still writes nothing (validate-then-write is unchanged).

## Risks

- One lock held across ≤100 small JSON lines. Accept.
- Empty `append_many` must not mkdir/rotate. Callers that pass `[]` after validate should not (ingest only calls it with a non-empty prepared list, or may pass empty if the body was empty — empty → 204 and no file).

## Implementation

### Files

- Change `src/musicweb/diag/store.py`
- Change `src/musicweb/routes/diag.py`
- Change `tests/test_diag_store.py`
- Change `tests/test_diag_ingest.py`

### Steps

1. Add `append_many(directory, records, *, day=None, max_bytes=DIAG_DIR_MAX_BYTES) -> Path | None`. Reject non-dict records the same way `append` does (before taking the lock). Empty list → `None`, no mkdir, no rotate. Otherwise mkdir, join JSON lines, one `_append_lock`, write, `maybe_rotate` once, return the day path.
2. `append(...)` becomes `append_many(directory, [record], day=day, max_bytes=max_bytes)` and returns that path. Delete the `rotate` parameter.
3. Ingest: keep the validate loop that builds `prepared` via `envelope`. Then `append_many(directory, prepared)`. Remove `maybe_rotate` import and the per-record `append(..., rotate=False)` loop.
4. Replace `test_append_rotate_false_skips_rotation` with: `append_many` of 3 records calls `maybe_rotate` once (spy on `store.maybe_rotate`); empty `append_many` does not call it and creates no file. Update the ingest rotate-once test to spy `musicweb.diag.store.maybe_rotate` (or assert via `append_many` behavior) — ingest must not mention `maybe_rotate`.

### Verify

- `uv run --group dev pytest tests/test_diag_store.py tests/test_diag_ingest.py`
- `rg "rotate=" src/musicweb/diag src/musicweb/routes/diag.py` — no matches.
- `rg "maybe_rotate" src/musicweb/routes/diag.py` — no matches.

## Acceptance

- [ ] Ingest writes a valid batch only through `append_many`.
- [ ] `append` has no `rotate` parameter.
- [ ] Three-line ingest still produces three JSONL lines and one rotate.
- [ ] Oversize-in-batch still writes nothing.
