# Stage 02: Library.present_audio

## Status
done

## Description

Add `Library.present_audio(rel) -> Path | None` (jail + is_file + is_audio). Replace the resolve-and-exists copies in stream, enqueue, radio station/catalog, lyrics, covers, local artist-image folder lookup, and cover GET. Stream maps `None` to 404.

## Rationale

The jail is already one function. Presence is re-decided at five wrappers plus three cousins. This stage deletes those wrappers; it does not add a parallel path helper.

## Invariants

- `Library.resolve` still raises `PathEscapeError` for escapes. Callers that need a directory (browse/collect) keep using `resolve`.
- `is_audio` still means indexable audio (`index_lossy` on the `Library` instance).
- HTTP stream still uses `stream_intent` after the file is present. This stage does not change encode policy.
- Radio picker eligibility SQL is unchanged; `present_audio` only replaces the filesystem check after the row is loaded.

## Risks

- `test_diag_media.py` patches `musicweb.routes.media._resolve_track_file`. Point those patches at `Library.present_audio` or at a thin route mapper that stays.
- Cover extract previously stored a resolved path even when the file was missing. Skipping `None` drops a later extract failure. That is intended.

## Implementation

### Files

- `src/musicweb/library.py`
- `src/musicweb/routes/media.py`
- `src/musicweb/transcode/enqueue.py`
- `src/musicweb/radio/station.py`
- `src/musicweb/radio/catalog.py`
- `src/musicweb/scan/lyrics.py`
- `src/musicweb/scan/covers.py`
- `src/musicweb/artist_images/local.py`
- `tests/library/test_path_jail.py`
- `tests/test_diag_media.py`

### Steps

1. Add `present_audio(self, rel: str | None) -> Path | None`. Treat empty/`None` rel as `None`. `resolve` inside `try`; on `PathEscapeError` or `OSError` return `None`. If not `path.is_file()` or not `self.is_audio(path)`, return `None`.
2. Delete `_resolve_track_file`. Stream: `path = lib.present_audio(track.rel_path)` after the existing `is_missing` / empty-path 404; if `path is None`, 404 `"Audio file not found"`. Cover GET lazy-fill uses `present_audio` instead of `resolve` + `except Exception`.
3. `enqueue_prepare`: `resolved = library.present_audio(track.rel_path)`; `None` increments `skipped`. Do not `except Exception`.
4. `RadioStation._resolve_path` becomes `present_audio` after the `is_missing` / empty guard (or inline and delete the method if it is only that). Catalog `snapshot_from_rows` uses `present_audio` instead of `resolve` + `is_file`.
5. `scan/lyrics._resolve_audio_path` → `library.present_audio`. `scan/covers.album_cover_sources` stores only `present_audio` hits. `artist_images/local.py` uses `present_audio` then `.parent` (still `None` if missing).
6. Tests: empty/escape/non-file/non-audio → `None`; indexable file under root → that path. Lossy file is `None` when `index_lossy=False` and a path when `True`. Keep existing `resolve` escape tests.

### Verify

- `rg -n "_resolve_track_file|_resolve_path|_resolve_audio_path" src/musicweb` is empty (or only a one-line `present_audio` alias you chose not to keep — prefer empty).
- `rg -n "library\\.resolve" src/musicweb` — remaining hits are browse/collect or `present_audio`’s own call, not stream/enqueue/radio/lyrics/covers/local.
- `uv run pytest tests/library/test_path_jail.py tests/test_diag_media.py tests/radio/test_catalog.py tests/transcode/test_enqueue.py tests/scan -q`

## Acceptance

- `present_audio` is the only filesystem presence check for track audio paths listed in Files.
- Stream 404s when `present_audio` returns `None`. Enqueue/radio/scan skip `None`. No call site catches bare `Exception` around `resolve` for those paths.
- `resolve` still raises on jail escape (existing tests).
- New `present_audio` tests pass; radio catalog and enqueue tests pass.
