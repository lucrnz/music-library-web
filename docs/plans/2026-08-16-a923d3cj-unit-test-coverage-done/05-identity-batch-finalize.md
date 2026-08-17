# Stage 05: Identity, batch, and finalize

## Status
done

## Description

SQLite tests for track identity/reattach, one batch upsert, and end-of-scan missing/recount. This is the scan heart.

## Rationale

Renames must keep playlist-stable ids when the fingerprint matches. Finalize is the only thing that marks unseen files missing and rolls up album `lossy_kind`. These bugs are silent in production without tests.

## Invariants

- Same fingerprint → same `tracks.id` after a path change.
- Same path + new fingerprint → old row `is_missing` with `rel_path is NULL`, new row inserted.
- Lossy siblings skipped by batch are **not** in the seen-path set (so finalize can mark a previously indexed lossy row missing).
- Use the stage 01 `db` fixture. Do not boot FastAPI. Do not read real audio (patch `compute_fingerprint` / `read_metadata` in batch tests).

## Risks

- ORM relationship load: `apply_track_fields` expects album/artist rows; construct via `ensure_*` rather than raw SQL.
- `process_batch` stats `Path.stat()` — tmp empty files are enough if fingerprint/metadata are patched.
- FTS upsert inside `apply_track_fields` requires `tracks_fts` from migrations (stage 01).

## Implementation

### Files

- Create: `tests/scan/test_identity.py`
- Create: `tests/scan/test_batch.py`
- Create: `tests/scan/test_finalize.py`

### Steps

1. **ensure_artist / ensure_album:** first call inserts; second call same normalized name returns same id; album year fills only when previously None.
2. **resolve_track reattach:** insert track fp=`aaa` path=`old/a.flac`; resolve same fp new path `new/a.flac` → same id, new `rel_path`, `is_missing is False`.
3. **resolve_track replacement:** existing path row fp=`aaa`; resolve same path fp=`bbb` → old missing + `rel_path is None`, new row id from `track_id_for`.
4. **apply_track_fields:** construct a `TrackMetadata` with title/artist/album; after apply, track columns match and `fts_search_track_ids` finds the title prefix.
5. **batch quick skip:** existing row same `rel_path`, `size_bytes`, `mtime_ns` → upserted 0 (patch fingerprint so a call would be detectable if invoked; assert it was not).
6. **batch lossy sibling:** lossless + lossy in one folder. Use the real sibling helpers (`should_skip_lossy` / `lossless_slots_in_dir`) with patched `read_metadata` and `is_lossless_audio`, matching `tests/test_lossy_siblings.py`. Skipped rel is in `skipped_rels` and not counted as seen.
7. **batch cancel:** `cancel` true on second file → loop stops, no exception.
8. **mark_missing:** two present tracks, `seen_paths` contains one rel → the other becomes missing and `rel_path is None`. Empty set marks both missing.
9. **recount lossless+mp3:** one album, present lossless + present mp3 → `lossy_kind == "mp3"`. Artist `track_count` / `album_count` update.
10. **recount mixed:** same album shape with present mp3 + present aac → `lossy_kind == "mixed"`.
11. **recount ignores missing:** a missing mp3 row does not change `lossy_kind` or counts.

### Verify

```sh
uv run --group dev pytest tests/scan/test_identity.py tests/scan/test_batch.py tests/scan/test_finalize.py
uv run --group dev pytest
```

## Acceptance

- [ ] Fingerprint reattach keeps `tracks.id` across a rename.
- [ ] Fingerprint change at the same path marks the old row missing and inserts a new one.
- [ ] Quick batch skips unchanged files; skipped lossy rels are not seen.
- [ ] Finalize: unseen present row marked missing; empty `seen_paths` marks all present missing.
- [ ] Recount: lossless+mp3 → `"mp3"`; mp3+aac → `"mixed"`; missing rows do not count.
