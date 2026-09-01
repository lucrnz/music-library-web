# Stage 02: Canonicalize on scan and remount existing VA rows

## Status
done

## Description

`ensure_artist` writes VA aliases to the one Various Artists row. Every `run_scan` (quick included) remounts already-indexed albums/tracks whose album-artist or track-artist name still matches the alias list, re-keys album cover files, updates FTS, and deletes leftover alias artist rows.

## Rationale

Quick scan skips unchanged files, so write-path-only canonicalization would leave `V.A.` / `オムニバス` artists forever. A SQL remount on every scan is the settled “no full scan, no Alembic” path and is what unblocks discovery and radio.

## Invariants

- After remount, at most one artist has `id == VA_ARTIST_ID`; its `name` is `Various Artists`.
- No remaining present track has a VA-alias string in `artist_name` or `album_artist_name`.
- Album identity stays `(album_artist_id, title_norm)`. Same title under two former aliases becomes one album.
- Track ids (fingerprints) do not change.
- `covers/artists-preferred/` is not deleted or rewritten.
- Regen-covers / regen-artist-images / regen-lyrics do not remount.

## Risks

- Re-keying `albums.id` while covers live at `covers/albums/{album_id}.*` can orphan art if the file rename is skipped or races extract.
- Merging two `Greatest Hits` comps concatenates tracks onto one album; duplicate track numbers are accepted.
- In-flight radio catalog still keyed by old album ids until the next `scan_finished_at` rebuild (existing invalidation).

## Implementation

### Files

- `src/musicweb/scan/identity.py`
- `src/musicweb/scan/va_remount.py`
- `src/musicweb/scan/jobs.py`
- `src/musicweb/images/webp_store.py`
- `src/musicweb/cover.py`
- `tests/scan/test_identity.py`
- `tests/scan/test_va_remount.py`

### Steps

1. In `src/musicweb/scan/identity.py` `ensure_artist`, if `is_va_name(display)` then use `VA_DISPLAY_NAME` / `VA_ARTIST_ID` (and `sort_name` of that display). First write wins on the canonical row; do not refresh a non-VA artist’s display from a later alias.
2. In `apply_track_fields`, keep calling `ensure_artist` for both names so new/changed files canonicalize without a second path.
3. Add `src/musicweb/images/webp_store.py` `rekey(old_id, new_id) -> None`: if `new_id` already `has()`, delete `old_id` files only; else rename both sizes when present. Never touch a different root.
4. Expose the same `rekey` on `CoverStore` in `src/musicweb/cover.py`.
5. Add `src/musicweb/scan/va_remount.py` `remount_va(session, covers: CoverStore | None) -> int` (rows touched or albums moved — pick one and test it):
   - Select artists whose `name` is `is_va_name` and `id != VA_ARTIST_ID`, plus the canonical row via `ensure_artist(session, VA_DISPLAY_NAME)`.
   - For each alias-owned album: compute `new_id = album_id_for(VA_ARTIST_ID, title_norm)`. If a survivor album with that id exists, move present (and missing) tracks onto it (`album_id`, `album_artist_id`, `album_artist_name=VA_DISPLAY_NAME`), `rekey` covers only when the survivor lacks them, delete the old album row. Else insert/update the album to `new_id` + `artist_id=VA_ARTIST_ID` and `rekey` covers.
   - For tracks whose `artist_id` is an alias artist or whose `artist_name` is `is_va_name`, set `artist_id=VA_ARTIST_ID` and `artist_name=VA_DISPLAY_NAME`.
   - `fts_upsert` every touched track (title / names / album title).
   - Delete alias artist rows with no remaining `tracks.artist_id`, `tracks.album_artist_id`, or `albums.artist_id`. Delete scanned `covers/artists/{id}.*` for those ids only if a store is passed; never preferred.
6. In `src/musicweb/scan/jobs.py` `_finalize`, after `mark_missing` and before `recount_entities`, call `remount_va`. Pass the process `CoverStore` into `_finalize` / `run_scan` so album art can rekey. Do not call remount from `regen_*`.
7. Extend `tests/scan/test_identity.py`: `ensure_artist("V.A.")` and `ensure_artist("Various Artists")` are the same row with display `Various Artists`.
8. Add `tests/scan/test_va_remount.py` with an in-memory DB: two albums under `VA` and `オムニバス` (same title and different titles), tracks with alias album artist + real track artist, a track whose artist tag is `V.A.`, cover files for an old album id, then `remount_va` + `recount_entities`. Assert one VA artist, merged same-title album, moved covers, rewritten names, FTS fields, deleted alias artists, unchanged track ids.

### Verify

- `uv run pytest tests/scan/test_identity.py tests/scan/test_va_remount.py tests/scan/test_finalize.py`
- `rg -n "remount_va" src/musicweb` is `va_remount.py` and `jobs.py` `_finalize` only.

## Acceptance

- A library that already has `V.A.` / `Various` / `オムニバス` album-artist rows becomes one Various Artists after a quick scan, without re-reading files.
- New files tagged any alias land on that same id on first upsert.
- Preferred artist-image files are untouched. Album covers follow remounted album ids.
- Regen jobs do not remount.
