# Stage 01: Forget primitive and radio retain set

## Status
done

## Description

Add `Transcoder.forget_paths` (drop matching jobs and all-profile cache files for given `rel_path`s) and `RadioStation.retained_track_ids` (current track plus every id after it in the live radio batches). No HTTP in this stage.

## Rationale

The route in stage 02 is a thin filter over these two operations. Pinning them first keeps radio-id leakage and “wipe the whole tree” mistakes out of the HTTP layer.

## Invariants

- Do not call `Transcoder.clear_cache` from forget.
- Do not serialize `retained_track_ids()` on any response or log line (radio upcoming must stay internal).
- Protection is by track id against current + remaining. `log_label` (`radio current` / `radio prewarm`) does not decide keep vs drop.
- Already-played ids still listed in the current batch, and every banlist id, are **not** in the retain set.
- A purged running job must not be re-queued (same `purged` flag `clear_cache` uses).
- Other queued/running jobs stay.

## Risks

- Waiting on `_current` the way `clear_cache` does can stall if the worker ignores cancel. Reuse that wait; do not invent a second cancel path.
- Computing retain as “all `_batches` ids” would protect already-played current-batch rows. The method must skip ids before current in `_ordered_queue()`.

## Implementation

### Files

- `src/musicweb/transcode/worker.py`
- `src/musicweb/radio/station.py`
- `tests/transcode/test_forget.py` (new)
- `tests/radio/test_station.py`

### Steps

1. On `RadioStation`, add `retained_track_ids() -> frozenset[str]`: empty when there is no current id; otherwise `{current} ∪ peek_upcoming_ids(n)` with `n` large enough to cover the rest of `_ordered_queue()`. Do not read the banlist. Do not depend on tuner count.
2. On `Transcoder`, add `forget_paths(relative_paths: Iterable[str]) -> int`. For each path, for each entry in `PROFILES`, compute the cache key. Under `_queue_cond`, drain matching jobs from `_urgent` and `_prewarm` with an error like “Stream forgotten”; if `_current` matches, set `purged`, cancel, wait. Then unlink each matching output and `.partial` (ignore missing). Return the number of files removed. Log a count only, not paths that would identify upcoming radio.
3. Do not add a route, do not touch `idle.py`.
4. Tests: retain set is current + after current only (seed a batch, advance one track, assert the played id is absent and later ids plus current are present). Forget deletes every profile file for a path, cancels a matching queued/running job, leaves a different path’s job and file, and does not empty the cache directory.

### Verify

- `uv run --group dev pytest tests/transcode/test_forget.py tests/radio/test_station.py`

## Acceptance

- `retained_track_ids()` matches current + remaining and excludes already-played current-batch ids and banlist-only ids.
- `forget_paths` removes all-profile jobs and files for the given paths and nothing else.
- `clear_cache`, idle sweep, and radio prepare are unchanged.
