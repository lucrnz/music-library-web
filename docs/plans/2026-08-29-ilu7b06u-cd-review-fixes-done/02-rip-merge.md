# Stage 02: Rip merge

## Status
done

## Description

When a later rip lands on an album that has an unripped hole at the same track number, attach the file to that stub so listens and the CD snapshot keep the same `tracks.id`. Spec: [identity-and-merge.md](context/identity-and-merge.md).

## Rationale

Stage 01 stores unripped stubs for Stats and remember. Without merge, a rip creates a second row and splits listens.

## Invariants

- Never replace a present file.
- Never change a stub `id`.
- Fingerprint uniqueness: the transient `resolve_track` row is gone before the stub takes the content fingerprint.
- Unripped leftovers on an occupied slot stay unripped.
- Do not reintroduce `fingerprint_algo` policy filters.

## Risks

- Same-name remaster still shares `album_id`. A rip with matching `track_no` can fill a CD hole that is a different recording. Accepted (same collision as bind).
- Files with no `track_no` cannot merge; they take the normal new-track path.

## Implementation

### Files

- `src/musicweb/scan/identity.py`
- `tests/scan/test_identity.py`
- `tests/scan/test_cd_merge.py`

### Steps

1. After `apply_track_fields` knows `album_id` and `track_no`, if another row on that album is `unripped` at that number (disc 1 / `NULL`) and no other **present** row holds the slot, move the file onto the stub (`fingerprint`, `fingerprint_algo`, `rel_path`, tech fields, `is_missing=false`, `unripped=false`) and delete the transient row created by `resolve_track`.
2. If a present row already occupies that number, leave the stub and keep the new track.
3. Tests in `tests/scan/test_cd_merge.py`: pure unripped album + matching rip reuses stub ids; deluxe album with present track 1 and an unripped hole at 13 attaches only 13; present track 1 is not replaced; a second file at track 1 does not steal the leftover stub; FTS gets the merged present row.

### Verify

```sh
uv run --group dev pytest tests/scan/test_cd_merge.py tests/scan/test_identity.py
```

## Acceptance

- Ripping into a CD-only album leaves the same `tracks.id` values the CD snapshot stored; those rows are present and not `unripped`.
- A present file at a track number is never overwritten by merge.
- `cd_identities.tracks_json` ids still resolve after merge (same ids).
