# Stage 03: Stream one success emit

## Status
done

## Description

Inline the stream fail dict into the reject helper. Emit `http.stream` once after plan and path are known. Keep the tight `ensure_stream` `except Exception`.

## Rationale

023 left two success emit copies and two reject helpers for one dict. Collapsing those does not change HTTP behavior.

## Invariants

- HTTP statuses for missing track, missing file, `StreamConflict` (409), bad codec (400) stay the same.
- Encode failure still emits reject (`status=500`, short `type: message`) and re-raises the original exception (not an HTTPException).
- `http.stream` stays `info`; `http.stream.reject` stays `error`.
- Failure `data` has `profile` and `reason`; no `codec` alias of `profile`.
- Worker still has no diag import. No library filesystem paths in `data`.

## Risks

- Do not hoist a bare `except Exception` around the whole handler — that would label unrelated bugs as stream rejects.

## Implementation

### Files

- Change `src/musicweb/routes/media.py`
- Change `tests/test_diag_media.py` only if a success-path assertion needs the single emit (existing passthrough tests already expect one line)

### Steps

1. Delete `_stream_fail_ctx`. `_emit_stream_reject` builds the fail dict inline (catalog fields + `status` / `detail`).
2. Inside the existing `try`: resolve track/file/plan as today. Passthrough vs encode only pick `path` / `media_type` / `filename`. Encode `ensure_stream` stays in its own `except Exception` (reject, raise).
3. After both branches: one `emit(..., "http.stream", level="info", data={track_id, codec, plan})`, then one `FileResponse`.
4. Outer `except HTTPException` still calls `_emit_stream_reject` and re-raises.

### Verify

- `uv run --group dev pytest tests/test_diag_media.py tests/test_diag_ingest.py`
- `rg "http.stream" src/musicweb/routes/media.py` — one success emit, reject only in the helper / excepts.
- `rg "_stream_fail_ctx" src/musicweb` — no matches.
- `rg "from musicweb.diag|emit\\(" src/musicweb/transcode` — no matches.

## Acceptance

- [ ] One success `http.stream` site on the stream route.
- [ ] One reject helper; fail dict is not a second function.
- [ ] Encode failure is still a tight inner `except Exception`.
- [ ] Existing missing-track and passthrough tests still pass.
