# Stage 01: Leftover husks

## Status
done

## Description

Delete parked leftover names and invert the radio HTTP helper. Frontend: dead manager-tree CSS, cellular/wifi `localStorage` keys, `setHealthContext`, `normalizeTrack`. Backend: move `serialize` into `routes/radio.py`, add `SnapshotTrack.from_track`, delete CoverStore has/path aliases, collapse metadata’s triple blank return, drop Phase-2 copy and the finalize `album_lossy_kind` comment.

## Rationale

Later stages must not keep importing dead names or `radio.now_playing`. CoverStore and serialize honesty unblocks job-phase and exclusive work from re-learning the old vocabulary.

## Invariants

- `serialize` payload shape (face, track fields, `position`) does not change.
- Album WebP still lives at `$MUSICWEB_DATA_DIR/covers/albums/`. Extract (`ensure_album_cover` / `get_or_fill`) stays on `CoverStore`.
- `fromApiTrack` still accepts snake + camel. Only the `normalizeTrack` alias dies.
- Health work is still `setHealthWork(source, bool)`. Downloads still compute `enabled && queueHasWork` in `queuePolicy.ts`.
- Mutagen still tries `easy=True`, then without, then blank. Only the three identical constructors collapse.

## Risks

- Tests import `serialize` from `musicweb.radio.now_playing`.
- Cover callers use `has_cover` / `cover_path` / `delete_album_cover`.
- `setHealthContext` mocks in queue-policy and connectivity tests.

## Implementation

### Files

- `frontend/css/modal.css`
- `frontend/src/stores/settings.ts`
- `frontend/src/connectivity.ts`
- `frontend/src/downloads/queuePolicy.ts`
- `frontend/src/models/track.ts`
- `frontend/src/downloads/queue.ts`
- `frontend/src/downloads/writer.ts`
- `frontend/tests/connectivity/healthWork.test.ts`
- `frontend/tests/downloads/queuePolicy.test.ts`
- `src/musicweb/radio/now_playing.py`
- `src/musicweb/routes/radio.py`
- `src/musicweb/radio/types.py`
- `src/musicweb/radio/station.py`
- `src/musicweb/radio/prepare.py`
- `src/musicweb/cover.py`
- `src/musicweb/routes/media.py`
- `src/musicweb/scan/covers.py`
- `src/musicweb/metadata.py`
- `src/musicweb/runtime/run_job.py`
- `src/musicweb/runtime/maintenance.py`
- `src/musicweb/scan/finalize.py`
- `tests/radio/test_now_playing.py`
- `tests/radio/test_prepare.py`

### Steps

1. In `frontend/css/modal.css`, delete the unused `.dl-artist` / `.dl-artist-head` / `.dl-album-head` / `.dl-track-row` / `.dl-tree-toggle` / `.dl-tree-label` / `.dl-album` rules (the manager mounts `TreeView`).
2. In `frontend/src/stores/settings.ts` `loadPrefs`, delete the `localStorage.removeItem("musicweb.streamCodecCellular")` and `removeItem("musicweb.onlyDownloadOnWifi")` blocks.
3. Delete `setHealthContext` from `frontend/src/connectivity.ts`. In `frontend/src/downloads/queuePolicy.ts`, call `setHealthWork("downloads", !!(downloadsEnabled && hasWork))`. Update `frontend/tests/connectivity/healthWork.test.ts` and `frontend/tests/downloads/queuePolicy.test.ts` to mock/assert `setHealthWork`.
4. Delete `normalizeTrack` from `frontend/src/models/track.ts`. In `frontend/src/downloads/queue.ts` and `frontend/src/downloads/writer.ts`, call `fromApiTrack`.
5. Move `serialize` from `src/musicweb/radio/now_playing.py` into `src/musicweb/routes/radio.py`. Delete `now_playing.py`. Point `tests/radio/test_now_playing.py` and `tests/radio/test_prepare.py` at `musicweb.routes.radio.serialize`.
6. Add `SnapshotTrack.from_track(row: Track) -> SnapshotTrack` on `src/musicweb/radio/types.py` with today’s `_snapshot_track` body. Use it in `src/musicweb/radio/station.py`. Delete `_snapshot_track`.
7. In `src/musicweb/radio/prepare.py` `refresh`, use `self._database.session()` as a context manager. Delete the manual `session()` / `try` / `finally: session.close()`.
8. In `src/musicweb/cover.py`, delete public `has_cover` / `cover_path` / `delete_album_cover`. Extract methods call `self._store.has` / `get_path` / `delete`. Expose `store` (the `WebpAssetStore`) for has/path. In `src/musicweb/routes/media.py` and `src/musicweb/scan/covers.py`, use `cover_store.store.has` / `get_path`. Keep `get_or_fill` / `ensure_album_cover` on `CoverStore`.
9. In `src/musicweb/metadata.py`, add `_blank(stem: str) -> TrackMetadata` and return it from the three mutagen-failure paths. One `MutagenFile(..., easy=True)`, then without, then blank.
10. In `src/musicweb/runtime/run_job.py` and `src/musicweb/runtime/maintenance.py`, delete “Phase 2” wording. Lock-error copy says the server holds the data-dir lock (or the control socket is down) — not to wait for a later phase. In `src/musicweb/scan/finalize.py`, drop the `album_lossy_kind` comment; the SQL reduce stays.

### Verify

- `uv run pytest tests/radio/test_now_playing.py tests/radio/test_prepare.py tests/radio/test_station.py tests/jobs/test_runner.py tests/test_formats.py tests/scan/test_metadata_bitrate.py`
- `pnpm --dir frontend test -- frontend/tests/connectivity/healthWork.test.ts frontend/tests/downloads/queuePolicy.test.ts frontend/tests/models/track.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "normalizeTrack|setHealthContext|radio\\.now_playing|from musicweb.radio.now_playing|has_cover\\(|cover_path\\(|delete_album_cover|streamCodecCellular|onlyDownloadOnWifi|Phase 2|album_lossy_kind" src frontend/src frontend/tests tests` is empty except `Album.has_cover` column / serializer key and archived `docs/plans/*-done/`
- `rg -n "dl-artist|dl-tree-" frontend/css frontend/src` is empty

## Acceptance

- `musicweb.radio.now_playing` is gone. `serialize` lives in `routes/radio.py`. Tests import it from there.
- One `SnapshotTrack.from_track`. Station does not hand-copy fields.
- Cover extract remains on `CoverStore`. Has/path/delete go through `WebpAssetStore`.
- No `normalizeTrack`, no `setHealthContext`, no Phase-2 copy, no dead `.dl-*` tree CSS, no cellular/wifi key purge.
- Metadata blank constructor exists once.
- Radio now-playing JSON and cover HTTP behavior are unchanged.
