# Stage 03: Radio retain

## Status
done

## Description

`/api/transcode/forget` stops importing the radio station. Lifespan registers a retain-ids hook; the route reads it through `routes/deps.py`. Skip-retained behavior is unchanged.

## Rationale

Stream-cache forget cannot stay coupled to the household clock. A retain callback keeps today’s “do not evict the live radio queue” rule without `media.py` naming radio.

## Invariants

- `resolve_forget(session, ids, retained)` still skips retained, unknown, missing, non-encode, and pathless ids.
- Retained set is still `station.retained_track_ids()` (current plus remaining queue).
- Forget still runs under `stream_cache_idle.run_exclusive`.

## Risks

- If lifespan sets the hook after the first request, a race could retain nothing. Set the hook in the same `lifespan` block that constructs `RadioStation`, before `yield`.
- Tests that call the forget route must still see retain; unit tests that call `resolve_forget` directly are unchanged.

## Implementation

### Files

- src/musicweb/main.py
- src/musicweb/routes/deps.py
- src/musicweb/routes/media.py
- tests/transcode/test_forget.py

### Steps

1. In `main.py` `lifespan`, after `station` exists, assign `app.state.retain_stream_ids = station.retained_track_ids` (zero-arg callable → `frozenset[str]`).
2. Add `retain_stream_ids(request) -> AbstractSet[str]` in `deps.py` that calls `request.app.state.retain_stream_ids()`. If the hook is missing, return an empty frozenset (should not happen in a live app).
3. In `media.py` `transcode_forget`, replace `request.app.state.radio.retained_track_ids()` with `retain_stream_ids(request)`. Do not import `RadioStation` or `app.state.radio` from `media.py`.
4. Keep `resolve_forget`’s signature. Extend `tests/transcode/test_forget.py` only if a new helper needs coverage; existing retain-skip tests must still pass.

### Verify

- `uv run pytest tests/transcode/test_forget.py tests/radio/test_station.py tests/routes/test_prepare.py tests/test_stream_cache_idle_http.py`

## Acceptance

- `rg -n "radio|retained_track" src/musicweb/routes/media.py` shows no radio station import or `app.state.radio`.
- `rg -n "retain_stream_ids" src/musicweb/main.py src/musicweb/routes/deps.py src/musicweb/routes/media.py` hits all three.
- `test_resolve_forget_skips_retained_unknown_lossy` and `test_resolve_then_forget_leaves_retained_files` still pass.
- `test_retained_track_ids_is_current_and_remaining` still passes.
