# Stage 02: Tagless can_encode for forget

## Status
done

## Description

Add `can_encode(*, is_lossy: bool) -> bool` next to `stream_intent` (`not is_lossy`). `resolve_forget` skips when `not can_encode`. Stop calling `stream_intent` with `DEFAULT_PROFILE_TAG`.

## Rationale

Forget has no client codec. Asking “would this encode as opus_192?” is a dummy tag. A named tagless check is the encode-cache half of `stream_intent` without inventing a profile.

## Invariants

- `stream_intent` product cases are unchanged.
- `enqueue_prepare` still uses `stream_intent(..., codec=profile_tag).kind != "encode"`. Do not switch enqueue to `can_encode` (it must honor the requested tag, including `SOURCE_TAG`).
- Radio tune-in still rejects `source` via `is_browser_listed_profile`.
- Lossy still has no encode cache.

## Risks

- Do not “also clean up” HTTP prepare’s `stream_intent(is_lossy=False)` probe. That is a tag-validity check, not a forget concern. Out of this stage.

## Implementation

### Files

- `src/musicweb/transcode/passthrough.py`
- `src/musicweb/transcode/forget.py`
- `tests/test_passthrough.py`
- `tests/transcode/test_forget.py` (only if it needs a new lossy skip assertion; existing skip-lossy case should still pass)

### Steps

1. In `passthrough.py`, add `def can_encode(*, is_lossy: bool) -> bool: return not is_lossy`.
2. In `resolve_forget`, replace the `stream_intent(..., codec=DEFAULT_PROFILE_TAG)` check with `not can_encode(is_lossy=bool(track.is_lossy))`. Drop the `DEFAULT_PROFILE_TAG` import if unused.
3. Test: `can_encode(is_lossy=False)` is true; `can_encode(is_lossy=True)` is false. Existing forget skip-lossy test still passes.

### Verify

- `rg -n "DEFAULT_PROFILE_TAG" src/musicweb/transcode/forget.py` is empty.
- `uv run --group dev pytest tests/test_passthrough.py tests/transcode/test_forget.py`

## Acceptance

- Forget does not pass a profile tag into `stream_intent`.
- `can_encode` is the only new name; it is not used as a second `is_lossy` throughout enqueue or HTTP.
- Lossy ids still skip forget; lossless still forget.
