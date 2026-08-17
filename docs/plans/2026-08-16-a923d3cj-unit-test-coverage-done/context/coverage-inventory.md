# Coverage inventory

Linked from [design.md](./design.md). Source of truth for *which* modules this plan covers. Exact assertions live in the stage files.

## Existing pytest files

Leave every current `tests/test_*.py` where it is. New files go under `tests/<package>/`. Do not `git mv` them in this plan (`test_diag_media.py` reads `worker.py` via `Path(__file__).parents[1]`).

## Backend — in scope

| Module | Stage | Behaviors to lock |
|---|---|---|
| `musicweb.library` | 03 | `resolve` jail (`..`, absolute, `~`); `relative_to_root`; `browse` / `collect_audio` hide non-audio and dotfiles; natural sort (`2` before `10`) |
| `musicweb.db.names` | 03 | `normalize_name` / `display_name` / `sort_name`; stable `artist_id_for` / `album_id_for` / `track_id_for` |
| `musicweb.db.fts` | 03 | `fts_query_string` tokenization + prefix; `fts_upsert` + `fts_search_track_ids`; empty query → `[]`; rebuild counts non-missing only |
| `musicweb.lyrics.parse` | 03 | `strip_remastered_noise`; `looks_like_lrc`; `plain_from_lrc`; `normalize_lyrics_text` |
| `musicweb.artist_images.pick` | 03 | Last.fm placeholder reject + size rank; MusicBrainz exact-name vs score≥95; Wikimedia File: rewrite; fanart thumb preference |
| `musicweb.routes.serializers` | 03 | `track_dict` missing path is null; `album_dict` `lossy_kind`; `lyrics_dict` pending / instrumental strips text |
| `musicweb.scan.fingerprint` | 04 | SHA-256 of tmp bytes; FLAC MD5 from mocked mutagen (int, bytes, zero → fallback); open failure → sha256 |
| `musicweb.scan.walk` | 04 | yields indexable files only; `index_lossy`; skips dotfiles; `cancel()` stops |
| `musicweb.scan.identity` | 05 | `ensure_artist` / `ensure_album` idempotent; `resolve_track` same fingerprint reattaches (path change keeps id); same path new fingerprint marks old missing; `apply_track_fields` writes FTS |
| `musicweb.scan.batch` | 05 | quick mode skips unchanged size+mtime; skip lossy sibling not counted as seen; cancel mid-batch |
| `musicweb.scan.finalize` | 05 | `mark_missing` unseen present rows; empty `seen_paths` marks all present missing; recount: lossless+mp3 → `lossy_kind == "mp3"`; mp3+aac → `"mixed"`; missing rows do not count |
| `musicweb.jobs.runner` | 06 | `start` False when busy; `run_sync` raises if busy; `request_cancel` idle → False and status stays `idle`; running cancel → `canceling`; after `run_sync` with stubbed `_execute` (return or raise), `is_running` is False. Mocked `_execute` via `start()` does **not** write ScanState `idle` (`_thread_main` only clears `_running`) |
| `musicweb.transcode.probe` | 07 | `tech_from_track`; `probe_source_audio_tech` returns `known` when complete; fills from mocked metadata; ffprobe parse via mocked `subprocess.run`; never calls real ffprobe |

Already covered (do not re-test): `scan.formats`, `scan.siblings`, `scan.lossy_kind`, `transcode.profiles` (including exclusive-only tags off the browser list), `transcode.passthrough`, `transcode.idle`, `transcode.null_tech_log`, `diag.*`, `cli.logs`, `exclusive.protocol`, `exclusive.session` hub, missing-track stream 404 (`test_stream_missing_track_writes_reject`).

## Backend — out of scope

`main.py`, `cli/*` except logs, `control/*`, `runtime/*`, `cache.py`, `http_client.py`, `pwa_shell.py`, `sw.template.js`, `metadata.py` (siblings already patch around it), `cover.py` extract, `artist_image.py` I/O, `artist_images/fetch.py` + `providers.py` + `local.py`, `lyrics/fetch.py` + `lrclib.py` + `local.py`, `images/*`, `scan/covers.py`, `scan/artist_images.py`, `scan/lyrics.py`, `scan/scanner.py` (re-export), `transcode/worker.py` encode, `transcode/deps.py`, `exclusive/app.py`, `exclusive/coreaudio.py`, `exclusive/mpv_player.py`, Alembic revision files, `db/repositories/*` beyond what identity/finalize already exercise, discovery/folders/playlists/pages/pwa/health routers as HTTP suites.

## Frontend — in scope

| Module | Stage | Behaviors to lock |
|---|---|---|
| `qualityRank.ts` | 08 | FLAC ranks above Opus; `localAtLeastAsGood`; tag heuristic `flac_24_96000` / `opus_192_48000` |
| `playBlock.ts` | 08 | `playBlockMessage` for every `PlayBlockReason`; unknown / empty / null → `null` |
| `networkConstraints.ts` | 08 | no `navigator` → unconstrained; `type===cellular` / `saveData` → constrained |
| `lyrics/parseLrc.ts` | 08 | timed lines; multi-stamp one lyric; meta tags ignored; empty/null → `[]` |
| `exclusive/formatPolicy.ts` | 08 | never invents tags outside catalog; prefer_source vs upsample_device |
| `exclusive/protocol.ts` | 08 | `envelope` shape / version |
| `lossyKind.ts` | 08 | `deliveryCodec` returns `source` for lossy; album/track label helpers |
| `models/track.ts`, `models/album.ts` | 08 | `fromApiTrack` / `fromApiAlbum`: snake_case API → camelCase; missing/lossy fields |
| `connectivity.ts` (classify + copy) | 08 | `classifyError`; `isItemFailHttpStatus`; banner/load-error copy. Do not bind `window` or run health probes. |
| `components/tree/flattenVisible.ts` | 08 | expanded vs collapsed; parentKey/depth; empty roots |
| `downloads/queuePolicy.ts` | 09 | `downloadAutoPauseReason` offline / server / metered via mocked `autoPauseReason` + `isConstrainedConnection` |
| `downloads/hierarchy.ts` | 09 | assemble artist→album→track sort after a tiny pure extract |
| `downloads/resolve.ts` | 09 | `shouldPreferLocalOnline` for the three playback policies |
| `downloads/actionKind.ts` | 09 | hide / download / busy / ready / retry from mocked catalog + `downloads` state |
| `stores/playlist.ts` | 10 | add/remove/reorder; repeat off/one/all; shuffle next/prev; `commit` writes `musicweb.playlist.v1` |
| `stores/settings.ts` | 10 | persist writes `musicweb.playbackPolicy` / `musicweb.streamCodec` / `musicweb.downloadCodec`; `getActiveStreamCodec` via mocked `canDetectConnectionType` / `isConstrainedConnection` |

Existing: `frontend/tests/icon.smoke.test.ts` → `frontend/tests/browser/icon.smoke.test.ts`.

## Frontend — out of scope

All Vue SFCs except Icon; `player.ts` / `playerSession.ts` / sinks; `downloads/{opfs,db,worker,catalog,ui,index}.ts` except as mocked collaborators; `pwa.ts`; `api.ts` HTTP; `codecProbes.ts`; `companionClient.ts`; `diag/*`; `router.ts`; `main.ts`.
