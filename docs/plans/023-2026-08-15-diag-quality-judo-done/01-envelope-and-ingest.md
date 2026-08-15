# Stage 01: Envelope, event_files, honest ingest

## Status
done

## Description

Add a single server envelope builder and a public `event_files()` listing. Point `emit` and ingest at the envelope. Make ingest validate the whole batch, then append, then rotate once. Fix `normalize_mode` without a type-ignore.

## Rationale

Three handwritten record dicts and two `events-*.jsonl` walkers are the duplication every later stage would copy. Partial ingest writes on a late 400 is a real batch-honesty bug.

## Invariants

- Envelope keys stay `ts`, `source`, `event`, `level`, `client_id`, `session_id`, `play_id`, `data`.
- Ingest still forces `source="client"` and does not call `emit`.
- `emit` cutoff (non-error + mode `errors` → no-op) is unchanged.
- `maybe_rotate` still never deletes the only remaining day file.

## Risks

- Changing ingest from per-line rotate to once-per-batch can leave the dir over cap until the batch finishes. Accept: one batch is ≤100 small objects.

## Implementation

### Files

- Create `src/musicweb/diag/envelope.py` (or put `envelope` + `event_files` in `store.py` if that stays under ~150 lines — prefer `store.py` for `event_files`, `envelope.py` or `emit.py` for the record builder; do not add a fourth module unless a file would otherwise mix store I/O with HTTP types)
- Change `src/musicweb/diag/store.py` (export `event_files`, keep `append` / `maybe_rotate`)
- Change `src/musicweb/diag/emit.py`
- Change `src/musicweb/diag/ids.py` (`normalize_mode` if/else, no `# type: ignore`)
- Change `src/musicweb/routes/diag.py`
- Change `tests/test_diag_ingest.py`
- Change `tests/test_diag_store.py` if `event_files` tests belong there

### Steps

1. `event_files(directory) -> list[Path]` = today’s `_event_files`, public. `maybe_rotate` calls it.
2. `envelope(*, source, event, level, client_id, session_id, play_id, data, ts=None) -> dict`. Missing/unparseable `ts` → `utc_ts()`. Invalid `level` → `"info"`. `data` not a dict → `{}`.
3. `emit` builds the record only via `envelope(source="server", ...)`.
4. Ingest: first loop validates (len ≤ 100 already; event name; data size). Any failure → 400 and **zero** appends. Second loop `append`s `envelope(source="client", ...)`. Then `maybe_rotate` **once**.
5. `append` may still call `maybe_rotate` for single-line `emit`; ingest should pass a flag or call a `append_many` that rotates once. Prefer `append(..., rotate=True)` default True; ingest uses `rotate=False` then one `maybe_rotate`.
6. `normalize_mode`: `if text == "everything": return "everything"` else `"errors"`.

### Verify

- `uv run --group dev pytest tests/test_diag_store.py tests/test_diag_ingest.py`
- Ingest 3 valid + 1 oversized `data` in one POST → 400 and **no** new JSONL lines.
- 3 valid events → 3 lines, `maybe_rotate` invoked once (spy/monkeypatch or a cap that would delete mid-batch if rotated per line — document the test).
- `rg "type: ignore" src/musicweb/diag/ids.py` — no matches.

## Acceptance

- [ ] `emit` and ingest produce records only through `envelope`.
- [ ] A failing event in a batch writes nothing.
- [ ] `event_files` is importable by the CLI later (`from musicweb.diag.store import event_files`).
- [ ] Mode normalize has no type-ignore.
