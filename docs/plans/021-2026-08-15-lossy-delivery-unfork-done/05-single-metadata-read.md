# Stage 05: One metadata read per kept lossy file

## Status
done

## Description

`process_batch` already calls `read_metadata` to test sibling skip. Reuse that object on the keep path instead of parsing the file again.

## Rationale

The skip check is the only new scan cost. Throwing the tags away and reading them again is wasted I/O on every indexed MP3/AAC.

## Invariants

- Sibling skip still uses filesystem lossless slots + `slot_key` from that meta.
- Kept lossy files still go through fingerprint + `apply_track_fields` with a full `TrackMetadata`.
- Lossless files still one `read_metadata` (after the quick-scan size/mtime skip), as today.
- Skipped siblings still do not increment `seen` and still join `skipped_rels`.

## Risks

- Reusing a stub/partial meta would under-fill tags. `read_metadata` is the same function both times today — reuse is the same object.

## Implementation

### Files

- Change `src/musicweb/scan/batch.py`

### Steps

1. For `is_lossy_audio(path)`, `meta = read_metadata(path)` once. If `should_skip_lossy(...)`, skip as now.
2. On the keep path, do not call `read_metadata` again; pass that `meta` into `apply_track_fields`.
3. Lossless keep path: leave `read_metadata` where it is today (after the size/mtime continue and fingerprint). Do not hoist lossless reads.

### Verify

- `rg "read_metadata" src/musicweb/scan/batch.py` — at most one call on the lossy keep path (the skip-gate call).
- `uv run --group dev pytest tests/test_lossy_siblings.py tests/test_formats.py`

## Acceptance

- [x] Kept lossy files parse tags once per batch visit.
- [x] Skip / seen_paths / lossless quick-scan behavior unchanged.
