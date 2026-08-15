# Stage 03: Scan lossy files and skip siblings

## Status
pending

## Description

When `MUSICWEB_INDEX_LOSSY` is on, walk and folder-browse MP3/AAC as well as lossless. Skip a lossy file that shares a folder + disc/track (or stem) with a lossless sibling. Roll `albums.lossy_kind` up at finalize. Flag off remains lossless-only.

## Rationale

This is the first stage that can put a niche album in the index. Sibling skip is what stops leftover transcode copies next to FLACs from becoming duplicate tracks and a lying album mark.

## Invariants

- Flag off: `iter_*` and `Library.is_audio` match today’s lossless set. Existing libraries scan as they do now.
- Flag on: indexable = lossless ∪ MP3 ∪ AAC-in-MP4.
- Same parent directory only. No cross-folder tag match.
- Match key: `(disc_no or 1, track_no)` when `track_no` is present; else case-folded filename stem.
- If a lossless sibling exists on disk, the lossy path is not upserted and is not added to `seen_paths`. A previously indexed lossy row at that path becomes missing at finalize.
- Playlists that referenced the dropped lossy id behave like any missing track.
- `albums.lossy_kind` is computed only from present (`is_missing = 0`) tracks: all those lossy tracks MP3 → `mp3`; all AAC → `aac`; any mix (including mixed with lossless plus more than one lossy format) → `mixed`; none → NULL.
- Fingerprints for lossy stay SHA-256. Do not invent a new algo.

## Risks

- Checking siblings by DB-only state races walk order. The skip must look at **the folder on disk**, not “have we upserted the FLAC yet.”
- Listing every sibling for every lossy file is O(n²) in a large folder. Cache a per-directory lossless slot map for the duration of the batch / folder.
- Quick scan skip (size+mtime unchanged) must not revive a lossy row whose lossless sibling appeared later: if the path is lossy and a lossless sibling now exists, treat it as a skip even on quick scan.
- `Library` is constructed in `bootstrap_services` without the flag today. It must receive `index_lossy` or it will hide MP3s from `/api/browse` while the scanner indexes them (or the reverse).

## Implementation

### Files

- Change `src/musicweb/library.py`
- Change `src/musicweb/runtime/bootstrap.py`
- Change `src/musicweb/scan/walk.py`
- Change `src/musicweb/jobs/runner.py`
- Change `src/musicweb/scan/batch.py`
- Change `src/musicweb/scan/finalize.py`
- Create `src/musicweb/scan/siblings.py` (pure match + folder lossless-slot map)
- Create `tests/test_lossy_siblings.py`
- Do **not** change `routes/media.py` or client play

### Steps

1. `Library.__init__(root, *, index_lossy: bool = False)`. `is_audio` calls `is_indexable_audio(path, index_lossy=self.index_lossy)`. Browse / collect follow `is_audio`.
2. `bootstrap_services` passes `settings.index_lossy`.
3. Rename or wrap `iter_lossless_audio` as `iter_indexable_audio(root, *, index_lossy, cancel)`. Runner uses it. Keep a thin `iter_lossless_audio` alias only if something external still imports it; otherwise delete the old name.
4. `siblings.py`:
   - `slot_key(disc, track, stem) -> tuple`
   - `lossless_slots_in_dir(directory) -> dict[slot, Path]` using `is_lossless_audio` + `read_metadata` (or filename stem).
   - `should_skip_lossy(path, meta, slots) -> bool`
5. `process_batch`: if `is_lossy_audio(path)` and `should_skip_lossy(...)`, do not fingerprint, do not upsert, do not count as seen for `seen_paths`. Quick-scan size/mtime hit on a lossy path still re-checks the sibling rule.
6. Finalize `recount_entities` (or a sibling function called next to it) sets `albums.lossy_kind` from present tracks. Clear to NULL when no present lossy tracks remain.
7. Tests with tmp directories and monkeypatched `is_lossless_audio` / `is_lossy_audio` / `read_metadata`: skip when track numbers match; skip when only stems match; do not skip different track numbers; do not skip when the sibling is in another folder; slot map treats missing disc as 1.

### Verify

- `uv run --group dev pytest tests/test_lossy_siblings.py tests/test_formats.py`
- Flag **off**: scan a folder that contains an MP3 next to a FLAC — MP3 still absent from the index and from `/api/browse`.
- Flag **on**, same folder: FLAC indexed, MP3 not present (`is_missing` if it was previously indexed). Album `lossy_kind` is null.
- Flag **on**, album that is only MP3/AAC: tracks appear, `is_lossy` true, album `lossy_kind` is `mp3` or `aac` or `mixed` as appropriate.
- Add a FLAC beside an already-indexed MP3, rescan: MP3 row missing, FLAC present.

## Acceptance

- [ ] Default-off scan and browse behavior is unchanged.
- [ ] Flag on indexes MP3/AAC that have no lossless sibling in the same folder.
- [ ] Same-folder lossless sibling suppresses the lossy path on first scan and drops a previously indexed lossy row on the next scan.
- [ ] `albums.lossy_kind` matches the settled roll-up after finalize.
- [ ] Stream of a newly indexed lossy track is still the old profile encode (or 400) — passthrough is stage 04.
