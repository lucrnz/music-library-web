# Stage 03: One server stream intent

## Status
done

## Description

Replace exception-raising `plan_stream` with a result-typed `stream_intent` in `passthrough.py`. Stream HTTP, `enqueue_prepare`, and forget consume it. Delete the HTTP `SOURCE_TAG` skip special case.

## Rationale

Lossy/source is one product rule implemented six ways. Enqueue silently skips lossy while stream 409s and radio tune-in rejects `source` independently. One function deletes those copies without changing what the client is allowed to request.

## Invariants

- `lossy + source` → `passthrough`. `lossless + profile` → `encode`. `lossy + profile` and `lossless + source` → `reject` (HTTP 409). Unknown / non-profile tags → `reject` (HTTP 400). Same outcomes as today’s `plan_stream` + `ValueError`.
- Radio tune-in codec stays `is_browser_listed_profile`: never `SOURCE_TAG`, never exclusive-only tags. Do not change `radio/protocol.py` rules.
- Lossy radio still plays as `source` on the client (`radio.ts` `streamCodecForLoad`). Server prepare of a lossy id stays a skip (`intent.kind != "encode"`).
- `enqueue_prepare` still skips missing, unreadable, and jail-escaping paths. `stream_intent` only replaces the `is_lossy` / tag decision.
- Forget still does not delete files for tracks that cannot have encode cache (lossy). Express that as “not encode,” not a second `is_lossy` comment in the route.
- Do not keep a `plan_stream` alias. Do not add `transcode/intent.py`.
- Do not log or return radio upcoming ids.

## Risks

- HTTP prepare today short-circuits `SOURCE_TAG` to “skip every id” without opening tracks. After this stage `enqueue_prepare` will look up those ids and skip each as not-encode. Counts must still sum to `skipped == len(ids)` for a source-only request (plus any missing ids, which were already skipped).
- Tests import `plan_stream` / `StreamConflict`. Rewrite them to assert `kind` / `status` instead of `pytest.raises`.

## Implementation

### Files

- `src/musicweb/transcode/passthrough.py`
- `src/musicweb/transcode/enqueue.py`
- `src/musicweb/transcode/forget.py`
- `src/musicweb/routes/media.py`
- `tests/test_passthrough.py`
- `tests/transcode/test_enqueue.py`
- `tests/transcode/test_forget.py` (only if forget tests hard-code `is_lossy` skip without going through the helper)

### Steps

1. In `passthrough.py`, replace `StreamPlan` / `plan_stream` with a frozen result, e.g. `StreamIntent(kind: "passthrough" | "encode" | "reject", detail: str = "", status: int = 409)`. `stream_intent(*, is_lossy: bool, codec: str) -> StreamIntent` implements the four product cases plus unknown-tag → `reject` status 400 (today’s `ValueError` from `get_profile`). Delete `StreamConflict`.
2. `routes/media.py` `stream`: call `stream_intent`; on `reject` raise `HTTPException(intent.status, intent.detail)`; on `passthrough` keep `passthrough_media`; on `encode` keep `ensure_stream`.
3. `transcode_prepare`: delete the `payload.codec == SOURCE_TAG` block. Validate the tag the same way as today for non-source (`get_profile` / 400), then always call `enqueue_prepare`.
4. `enqueue_prepare`: replace `if track.is_lossy: skip` with `if stream_intent(is_lossy=track.is_lossy, codec=profile_tag).kind != "encode": skip`.
5. `resolve_forget`: replace `track.is_lossy` with the same “not encode” check. Forget has no client codec — use any browser-listed default (`DEFAULT_PROFILE_TAG`) so lossy → reject → skip, lossless → encode → forget. Do not pass `SOURCE_TAG`.
6. Rewrite `tests/test_passthrough.py` for the result type. Extend `test_enqueue.py` so a lossy id and a `SOURCE_TAG` request increment `skipped` and never call `prepare`.

### Verify

- `uv run --group dev pytest tests/test_passthrough.py tests/transcode/test_enqueue.py tests/transcode/test_forget.py tests/radio/test_prepare.py tests/radio/test_protocol.py`

## Acceptance

- There is no `plan_stream` or `StreamConflict` in `src/` or `tests/`.
- Stream HTTP status codes match today’s 409/400 for the same inputs.
- `enqueue_prepare` never calls `Transcoder.prepare` for a lossy track or a `SOURCE_TAG` request.
- Radio tune-in still rejects `source` and non-`browser_listed` tags.
- `POST /api/transcode/prepare` with `codec=source` returns skip counts and does not have a separate branch in `media.py`.
