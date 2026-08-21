# Stage 02: Forget HTTP and delete wipe-all clear

## Status
done

## Description

Add `POST /api/transcode/forget`, delete `POST /api/cache/clear`, and delete `StreamCacheIdle.run_clear`. The new handler unique-s ids, subtracts the radio retain set, resolves the rest, and runs `forget_paths` under the idle exclusive gate.

## Rationale

This is the server contract change. Stage 01 has the primitives; this stage is what the SPA will call and what removes the old full-wipe POST.

## Invariants

- Response body is counts only (`forgotten`, `skipped`). No id arrays.
- Do not log skipped ids (that set is the radio retain intersection).
- Empty `ids` → 200 with zeros.
- Unknown, missing, lossy, or pathless rows → skipped, not 4xx.
- `max_length=1000` on `ids`, same as prepare.
- Forget must not `note_swept`. Idle wipe can still run later.
- Forget and `sweep_if_due` share the idle asyncio gate.
- Radio must still never call `drop_pending_prewarm` or `clear_cache`.

## Risks

- Leaving `run_clear` “for later” reintroduces a full-wipe HTTP hook. Delete it in this stage.
- Running `forget_paths` without the idle gate can race a directory wipe. Use a generic exclusive helper, not a second lock.

## Implementation

### Files

- `src/musicweb/routes/media.py`
- `src/musicweb/transcode/idle.py`
- `src/musicweb/transcode/worker.py` (module docstring: drop `/api/cache/clear`)
- `src/musicweb/routes/deps.py` (only if a radio-station helper is added)
- `tests/test_stream_cache_idle.py`
- `tests/transcode/test_forget.py` or `tests/routes/` helper tests (new cases)

### Steps

1. Replace `run_clear` with something like `run_exclusive(fn)` that takes the same gate + `to_thread` shield and does **not** `note_swept`. Update the one test to the new name; keep the assertion that exclusive does not mark swept and that a later `sweep_if_due` can still fire.
2. Delete `@router.post("/cache/clear")` and the `scope` query.
3. Add `POST /transcode/forget` (same router prefix as prepare → `/api/transcode/forget`). Body `{ ids: list[str] }`. Resolve `app.state.radio.retained_track_ids()`. Unique input ids; `forget = [id for id in ids if id not in retained]`. Load those rows; collect `rel_path` for present lossless tracks; `skipped` = unique requested minus ids actually handed to `forget_paths`. `await idle.run_exclusive(lambda: tc.forget_paths(paths))`. Return `{ "forgotten": <ids acted on>, "skipped": <rest> }` — integers, no lists.
4. Extract the filter+resolve if that keeps the handler as thin as prepare. Do not add a GET that returns the retain set.
5. Tests: unprotected id is forgotten; an id in current+remaining is skipped and its file remains; already-played current-batch id is forgotten; empty body; unknown id skipped; after exclusive, `already_swept` is still false.

### Verify

- `uv run --group dev pytest tests/test_stream_cache_idle.py tests/transcode/test_forget.py`
- Plus any new route/helper tests added in this stage
- Grep the tree (except `docs/plans/`) for `/api/cache/clear` and `run_clear` — no remaining code references

## Acceptance

- `POST /api/cache/clear` is gone (404).
- `POST /api/transcode/forget` forgets unprotected ids’ jobs and files and leaves radio current+remaining files.
- `run_clear` does not exist. Idle sweep and shutdown still wipe the whole cache.
