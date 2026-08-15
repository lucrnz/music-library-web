# Stage 04: Stream one try/except

## Status
done

## Description

Rewrite `/api/stream` so reject emit happens in one `except HTTPException` (and one encode-failure mapping). Success emit happens once. Failure context uses catalog keys plus `status`/`detail` — no doubled `codec`/`profile` or `reason`/`detail` aliases. Tests call `stream()`, not only `emit()`.

## Rationale

Five emit-then-raise sites are how the next 404 grows a sixth. Tests that only call `emit()` never proved the route.

## Invariants

- HTTP statuses for missing track, missing file, `StreamConflict` (409), bad codec (400) stay the same.
- `http.stream` remains `info` (Errors only does not persist it). `http.stream.reject` remains `error`.
- Worker still has no diag import.
- No library filesystem paths in `data`.

## Risks

- A bare `except HTTPException` must not swallow unrelated middleware errors — only re-raise after emit.
- Encode `Exception` must still become the same HTTP behavior as today (currently re-raised raw). Do **not** invent a new 500 response shape; emit reject then re-raise as now.

## Implementation

### Files

- Change `src/musicweb/routes/media.py`
- Change `tests/test_diag_media.py`

### Steps

1. Delete `_stream_fail_ctx` doubling. One helper: catalog fields (`track_id`, `play_source="streaming"`, `profile=codec`, `reason=detail`, `connectivity=None`) plus `status` and `detail` as extras only.
2. `stream`: `try` the existing body. On `HTTPException`, emit reject with `exc.status_code` / `str(exc.detail)`, then raise. On successful `FileResponse` path, emit `http.stream` once (`plan` passthrough|encode) then return.
3. Encode `ensure_stream` failure: emit reject (`status=500`, short `type: message`), re-raise. Do not wrap it as HTTPException unless the route already did (it does not).
4. Remove the per-site `_emit_stream_reject` calls before each raise.
5. Tests: build a Request with `diag_dir` + mode cookie/header (reuse ingest `_request` shape). Monkeypatch `tracks_repo.get`, `library`, `_resolve_track_file` / transcoder as needed.
   - Missing track + Errors only → 404 **and** one `http.stream.reject` line.
   - Success path (passthrough) + Everything → one `http.stream` line; Errors only → no `http.stream` line.
6. Keep the worker-import assertion.

### Verify

- `uv run --group dev pytest tests/test_diag_media.py tests/test_diag_ingest.py`
- `rg "_emit_stream_reject" src/musicweb/routes/media.py` — at most the except-block helper, not five call sites before raise.
- `rg "from musicweb.diag|emit\\(" src/musicweb/transcode` — no matches.
- `rg "rel_path" src/musicweb/routes/media.py` — no new uses inside `data=` / `envelope` / `emit` dicts.

## Acceptance

- [ ] One reject emit site on the stream route.
- [ ] Failure `data` has `profile` and `reason`; does not also set `codec` as an alias of `profile`.
- [ ] Tests invoke `stream` (or the route function) and assert JSONL + status.
- [ ] Worker untouched.
