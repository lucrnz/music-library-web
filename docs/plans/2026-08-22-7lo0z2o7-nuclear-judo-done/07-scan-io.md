# Stage 07: Scan I/O

## Status
done

## Description

One mutagen / MP4 open per path on the batch + sibling hot path. Sibling skip keys stay tag-based (same winners). Lyrics pass1b stays.

## Rationale

Index multiplies file opens (`audio_kind` then `read_metadata`, and siblings do both again per lossless neighbor). Sharing a per-path cache deletes that I/O without changing who is indexed.

## Invariants

- Same skip-lossy winners (disc/track or stem vs lossless sibling).
- Walk eligibility (`formats.audio_kind` / `is_indexable_audio`) stays the product rule.
- Lyrics still collects missing/non-ok, fingerprint-mismatch (pass1b), and sidecar upgrades; `needs_fetch` still gates.

## Risks

- Caching `None` for an unreadable file must not mark a later retry in the same batch as present. Cache successful `TrackMetadata` only, or cache a sentinel that `process_batch` already treats as skip.
- `is_lossless_audio` in siblings must use the cache or extension/`audio_kind` result already computed — do not reopen MP4 for ALAC vs AAC after `read_metadata`.

## Implementation

### Files

- src/musicweb/scan/batch.py
- src/musicweb/scan/siblings.py
- tests/scan/test_batch.py
- tests/scan/test_lossy_siblings.py
- tests/scan/test_metadata_bitrate.py

### Steps

1. Give `process_batch` a per-batch `meta_by_path` cache. For each path, call `read_metadata` at most once and reuse that `TrackMetadata` for sibling skip and upsert. Do not also call `audio_kind(path)` on a path you are about to (or just did) `read_metadata`.
2. Change `lossless_slots_in_dir` to accept an optional `read_meta: Callable[[Path], TrackMetadata | None]` (default today’s `read_metadata`). `process_batch` passes a getter that fills `meta_by_path`. Decide lossless-vs-lossy from that metadata (or extension) so siblings do not reopen a path already in the cache.
3. Do not change `slot_key` / `should_skip_lossy` rules. Do not change `walk.py` (walk + batch may still be two opens of the same file). Do not edit `formats.py` or `metadata.py` unless a helper is required to classify from `TrackMetadata` without a new file open — if so, add that helper in `siblings.py` or `batch.py`.
4. Do **not** edit `scan/lyrics.py` pass1b.
5. Extend `tests/scan/test_batch.py` and `tests/scan/test_lossy_siblings.py` so a folder with lossless + lossy siblings still skips the same lossy path. Bitrate-mode tests still pass (`test_metadata_bitrate.py`).

### Verify

- `uv run pytest tests/scan/test_batch.py tests/scan/test_lossy_siblings.py tests/scan/test_metadata_bitrate.py tests/scan/test_walk.py tests/scan/test_index_phase.py tests/lyrics/test_parse.py`

## Acceptance

- `rg -n "_pass1b_fingerprint_mismatch_ids" src/musicweb/scan/lyrics.py` still hits (pass1b not deleted).
- In `process_batch`, a given `path` does not call both `audio_kind(path)` and `read_metadata(path)` as separate uncached opens (the lossy-then-upsert path shares one meta).
- `lossless_slots_in_dir` used from `process_batch` does not `read_metadata` a path already in that batch cache.
- Sibling skip tests still skip the same MP3/AAC when a lossless sibling shares disc/track or stem.
- Walk / index-phase tests still pass.
