# Stage 03: Tags, covers, local lyrics

## Status
done

## Description

Enrich each allowlisted file with mutagen tags (same fields as scan), serve queue/now-playing covers (embedded then folder image) over companion HTTP, and serve disc-local lyrics (sidecar `.lrc` then embedded tags).

## Rationale

The filesystem pane and the CD queue need titles, covers, and local lyrics without writing the library. Stage 01 listings are names only.

## Invariants

- Reuse `musicweb.metadata.read_metadata` and `musicweb.lyrics.local.read_local_lyrics`. Do not invent a second tag mapper.
- Import `FOLDER_COVER_NAMES` and the existing ffmpeg embedded-extract helper (`_extract_embedded` or the scan cover equivalent). Do not copy a second cover argv.
- Covers are never written under `$MUSICWEB_DATA_DIR/covers/`. Process-temp or in-memory bytes only.
- Cover order is embedded (ffmpeg extract) then `FOLDER_COVER_NAMES` in the file’s directory.
- Local lyrics never call LRCLIB (stage 06).
- After each folder enrich batch, and once when the walk finishes, **push** `cdrom_list` for that `rel`. Filename remains the fallback until that message. No client poll loop.
- Missing tags are nulls, not guessed MusicBrainz values.

## Risks

- ffmpeg cover extract per file on insert can hitch the companion if done on the watch thread. Enrich off the watch loop.
- Mutagen on a scratched file must not drop the whole index.

## Implementation

### Files

- `src/musicweb/exclusive/optical_meta.py`
- `src/musicweb/exclusive/optical_fs.py`
- `src/musicweb/exclusive/optical_session.py`
- `src/musicweb/exclusive/app.py`
- `tests/exclusive/test_optical_meta.py`
- `tests/exclusive/test_cdrom_http.py`

### Steps

1. Add `src/musicweb/exclusive/optical_meta.py`: `enrich_file(path) -> FileMeta` via `read_metadata`; `cover_bytes(path) -> bytes | None` (embedded then folder); `local_lyrics(path)` via `read_local_lyrics`. Swallow per-file errors; leave that file unenriched.
2. After `walk_volume`, schedule enrichment on a worker so `optical_session` watch stays responsive. Update the cached index in place. After each folder batch (and once at walk-complete), push `cdrom_list` for that `rel` to the connected controller. Do not wait for the client to re-`list_cdrom`.
3. Extend `cdrom_list` file rows with title, artist, album, albumartist, track, disc, year, duration, source_codec, sample_rate_hz, bit_depth, channels, has_cover, has_local_lyrics. Keep `rel` + name. Walk-time `source_codec` / allowlist kind is already on the file from stage 01; enrich may refine duration / bitrate, not the LossyMark kind.
4. In `src/musicweb/exclusive/app.py`, add `GET|HEAD /cdrom/cover` and `GET /cdrom/lyrics` (same `_require_file_token` + `device` + `rel` jail as `/cdrom/file`). Cover is image bytes; lyrics is JSON `{ plain, synced, source }` or empty 200 with nulls. Wrong token **401**; jail miss **404**.
5. Tests in `tests/exclusive/test_optical_meta.py` with tiny fixture files (or mutagen-written temps): tags, folder `cover.jpg` when no embed, sidecar `.lrc` wins over tags, bad file does not raise. Extend `tests/exclusive/test_cdrom_http.py` for cover/lyrics 404 jail.

### Verify

- `uv run pytest tests/exclusive/test_optical_meta.py tests/exclusive/test_cdrom_http.py`
- `rg -n "covers/albums|CoverStore" src/musicweb/exclusive/optical_meta.py` is empty.

## Acceptance

- A tagged MP3 in the fake volume lists title/artist/album/track.
- After a folder enrich batch, a connected client receives a pushed `cdrom_list` for that `rel` without sending `list_cdrom` again.
- Cover GET returns embedded bytes when present, else folder image, else 404.
- Lyrics GET returns sidecar text when `{stem}.lrc` exists.
- No library cover files are created.
- Watch/list still succeed if one file’s mutagen/ffmpeg call throws.
