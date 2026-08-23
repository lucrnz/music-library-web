# Stage 02: Delete browse/collect server API

## Status
done

## Description

Remove `GET /api/browse`, `GET /api/collect`, `Library.browse`, `Library.collect_audio`, `tracks_repo.id_map_for_paths`, and the tests that exist only for those helpers.

## Rationale

Stage 01 leaves those endpoints with zero callers. Deleting them here finishes the full-stack decision so a later client cannot grow a second Folders view against leftover HTTP.

## Invariants

- `Library.resolve` and `Library.present_audio` stay. Path jail for stream, scan, covers, and artist-image lookup does not change.
- No route module is named `folders`. `routes/api.py` does not import one.
- `_natural_key` is deleted with browse/collect if it has no remaining caller (today it does not).
- `id_map_for_paths` is deleted with the folders routes if it has no remaining caller (today it does not). `tracks.rel_path` and other track queries stay.
- Scan sibling skip, cover folder-filename lookup, and track path columns are untouched.

## Risks

- A hidden import of `musicweb.routes.folders` or `Library.browse` outside the files listed here would fail at import or test collection. Grep before deleting.

## Implementation

### Files

- `src/musicweb/routes/folders.py`
- `src/musicweb/routes/api.py`
- `src/musicweb/library.py`
- `src/musicweb/db/repositories/tracks.py`
- `tests/library/test_browse.py`

### Steps

1. Grep the repo (except `docs/plans/`) for `musicweb.routes.folders`, `Library.browse`, `collect_audio`, `id_map_for_paths`, `/api/browse`, and `/api/collect`. The only remaining production hits should be the files in Files (plus any stage-01 leftovers, which must already be gone).
2. Delete `src/musicweb/routes/folders.py`.
3. In `src/musicweb/routes/api.py`, drop the `folders` import and `include_router(folders.router)`.
4. In `src/musicweb/library.py`, delete `browse`, `collect_audio`, and `_natural_key`. Drop `import re` if unused. Keep `resolve` and `present_audio`. Adjust the module / class docstrings so they describe path jail and present-audio, not directory listing.
5. In `src/musicweb/db/repositories/tracks.py`, delete `id_map_for_paths`. Do not touch `get`, `get_many`, `list_for_album`, or `rel_path` on the model.
6. Delete `tests/library/test_browse.py`.

### Verify

```sh
uv run --group dev pytest tests/library
```

Confirm `rg -n "folders|/api/browse|/api/collect|collect_audio|id_map_for_paths|def browse" src/musicweb tests` shows no browse-API hits (`present_audio` / `resolve` / scan “same folder” are fine).

## Acceptance

- `/api/browse` and `/api/collect` do not exist. `musicweb.routes.folders` does not exist.
- `Library` still jails paths and presents indexable audio.
- `tests/library` passes. No new test boots the app or hits the deleted routes.
