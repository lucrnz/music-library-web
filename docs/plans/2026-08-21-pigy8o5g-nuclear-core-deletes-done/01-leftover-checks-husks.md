# Stage 01: Leftover checks and husks

## Status
done

## Description

Delete the parked leftover checks and husks: `is_file()` after `present_audio`, dummy prepare `stream_intent(is_lossy=False)`, `ArtistImageStore`, coreaudio `ALLOWLIST_*`, `client_payload_action`, the `ScanMode` twin, `station._iso`, and the unused Python `album_lossy_kind`.

## Rationale

Later stages must not keep importing dead names. Prepare/media honesty unblocks the artist-image route split. One owner for lossy-kind and exclusive rates stops the next copy.

## Invariants

- `present_audio` remains jail + exists + indexable; callers do not re-check `is_file()`.
- Prepare `SOURCE_TAG` is still HTTP 200 with enqueue skipping every id. Unknown profile tags are still HTTP 400.
- Scanned artist WebP still lives at `$MUSICWEB_DATA_DIR/covers/artists/{id}.{full|thumb}.webp`.
- Exclusive rate/depth allowlist values stay `EXCLUSIVE_RATES_HZ` / `EXCLUSIVE_DEPTHS`.
- Radio persist timestamps keep microseconds (`format_iso_utc`, not `utc_now_iso`).
- `recount_entities` SQL reduce is unchanged.

## Risks

- Replacing `ArtistImageStore` method names (`has_image` → `has`) misses a call site.
- `get_profile("source")` would 400 prepare; must special-case `SOURCE_TAG` before `get_profile`.

## Implementation

### Files

- `src/musicweb/routes/media.py`
- `src/musicweb/lyrics/fetch.py`
- `src/musicweb/artist_image.py`
- `src/musicweb/runtime/bootstrap.py`
- `src/musicweb/routes/deps.py`
- `src/musicweb/jobs/runner.py`
- `src/musicweb/artist_images/fetch.py`
- `src/musicweb/exclusive/coreaudio.py`
- `src/musicweb/radio/protocol.py`
- `src/musicweb/radio/station.py`
- `src/musicweb/scan/lossy_kind.py`
- `src/musicweb/timeutil.py`
- `tests/jobs/test_runner.py`
- `tests/artist_images/test_preferred_scan_isolation.py`
- `tests/radio/test_protocol.py`
- `tests/scan/test_finalize.py`
- `tests/test_album_lossy_kind.py`
- `tests/routes/test_prepare.py`

### Steps

1. In `src/musicweb/routes/media.py` cover handler, drop `and audio_path.is_file()` after `present_audio`. In `transcode_prepare`, stop calling `stream_intent(is_lossy=False, …)`. If `payload.codec == SOURCE_TAG`, skip the tag probe. Else `get_profile(payload.codec)` and map `ValueError` to HTTP 400. Enqueue is unchanged.
2. In `src/musicweb/lyrics/fetch.py`, treat a non-`None` `abs_path` as a present file (`if abs_path is not None:`). Do not call `abs_path.is_file()` for the audio (`.lrc` sibling `is_file()` stays).
3. Delete `src/musicweb/artist_image.py`. In `src/musicweb/runtime/bootstrap.py`, construct `WebpAssetStore(settings.musicweb_data_dir / "covers" / "artists")` and type `RuntimeServices.artist_image_store` as `WebpAssetStore`. Point `src/musicweb/routes/deps.py`, `src/musicweb/jobs/runner.py`, `src/musicweb/artist_images/fetch.py`, `tests/jobs/test_runner.py`, and `tests/artist_images/test_preferred_scan_isolation.py` at `WebpAssetStore`. Replace `has_image` / `image_path` / `ensure_from_bytes` with `has` / `get_path` / `write_from_bytes`. In `src/musicweb/routes/media.py` artist-image GET, use `scanned.has` / `scanned.get_path`.
4. In `src/musicweb/exclusive/coreaudio.py`, import `EXCLUSIVE_RATES_HZ` and `EXCLUSIVE_DEPTHS` from `musicweb.transcode.profiles`. Delete `ALLOWLIST_RATES` / `ALLOWLIST_DEPTHS`. Use the imported names at every former allowlist site.
5. Delete `client_payload_action` from `src/musicweb/radio/protocol.py`. In `tests/radio/test_protocol.py`, call `parse_client_payload` and assert the action (first tuple element).
6. Delete the `ScanMode` Literal from `src/musicweb/jobs/runner.py`. Import `ScanMode` from `musicweb.scan.batch` and keep exporting it from the runner so the jobs package `__init__` needs no edit.
7. Add `format_iso_utc(dt: datetime) -> str` to `src/musicweb/timeutil.py` with today’s `RadioStation._iso` body. Use it in `src/musicweb/radio/station.py` persist. Delete `_iso`.
8. Delete `src/musicweb/scan/lossy_kind.py` and `tests/test_album_lossy_kind.py`. In `tests/scan/test_finalize.py`, add recount cases: all-aac → `"aac"`; unknown present lossy (`source_codec` opus or `None`) → `"lossy"`; mp3 + unknown → `"mixed"`. Do not change the SQL in finalize.
9. Add `tests/routes/test_prepare.py`: unknown tag → 400; `codec=source` → 200 with skipped counts (no 409); a listed profile does not 400 on the tag check.

### Verify

- `uv run pytest tests/routes/test_prepare.py tests/library/test_path_jail.py tests/scan/test_finalize.py tests/radio/test_protocol.py tests/jobs/test_runner.py tests/artist_images/test_preferred_scan_isolation.py tests/test_passthrough.py tests/transcode/test_enqueue.py tests/test_profiles.py`
- `rg -n "ArtistImageStore|album_lossy_kind|client_payload_action|ALLOWLIST_RATES|stream_intent\\(is_lossy=False" src tests` is empty
- `rg -n "is_file\\(\\)" src/musicweb/routes/media.py src/musicweb/lyrics/fetch.py` shows no audio `is_file` after `present_audio`

## Acceptance

- No `is_file()` on a `present_audio` result in media cover or lyrics fetch.
- Prepare HTTP does not call `stream_intent`. `SOURCE_TAG` is 200; unknown tag is 400.
- `artist_image.py` is gone. Scanned portraits are a `WebpAssetStore` under `covers/artists/`.
- Coreaudio allowlist is `EXCLUSIVE_*` from profiles.
- `client_payload_action` is gone. Protocol tests use `parse_client_payload`.
- One `ScanMode` Literal, in `scan/batch.py`.
- Station persist uses `format_iso_utc`.
- `lossy_kind.py` and `test_album_lossy_kind.py` are gone. Finalize tests cover aac / unknown / mixed-unknown.
