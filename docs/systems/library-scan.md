# Library scan

## Source of truth

- Job orchestration (scan + regen kinds): `src/musicweb/jobs/runner.py` (single-flight, `ScanState`, `_begin` / `_begin_phase`; a completed scan writes `last_scan_finished_at` for radio via `radio_repo.scan_finished_at`). Kind dispatch calls `src/musicweb/scan/jobs.py` (`run_scan` / `regen_covers` / `regen_artist_images` / `regen_lyrics`). The runner does not walk files.
- Index walk + batch flush: `src/musicweb/scan/index_phase.py` (`run_index`)
- Walk / formats: `src/musicweb/scan/walk.py`, `formats.py`
- Album lossy-kind reduce: SQL in `finalize.recount_entities` (`mp3` / `aac` / `lossy` / `mixed`)
- Album duration recount: same `recount_entities` pass (sum of present-track `duration_ms`; null if any present track lacks duration)
- Fingerprints / identity: `src/musicweb/scan/fingerprint.py`, `identity.py` (a later rip attaches to an unripped CD hole at the same album + track number; never replaces a present file). `count_missing` excludes `unripped` stubs.
- Batch upsert: `src/musicweb/scan/batch.py` (one `read_metadata` per path; shared cache with `siblings.lossless_slots_in_dir`)
- Enrichment loop: `src/musicweb/scan/enrichment.py` (`iter_enrichment`)
- Covers / artist images / lyrics phases: `scan/covers.py`, `scan/artist_images.py`, `scan/lyrics.py`
- Artist-image HTTP: `provider_json` in `src/musicweb/artist_images/providers.py`
- Sidecar `.lrc` probe: `sidecar_lrc_exists` in `src/musicweb/lyrics/fetch.py`
- Album cover extract: `CoverStore` in `src/musicweb/cover.py` (has/path live on `WebpAssetStore`)
- Finalize (missing + counts): `src/musicweb/scan/finalize.py`
- HTTP triggers: `src/musicweb/routes/library_scan.py`
- CLI: `src/musicweb/cli/`; live control plane: `src/musicweb/control/`

## Purpose

Build and refresh the SQLite index from the files under `MUSIC_LIBRARY_PATH` without blocking the HTTP server. The walk is **indexable** audio: packed lossless always, plus MP3/AAC when `MUSICWEB_INDEX_LOSSY` is on. Eligibility classifies a file once (lossless / lossy / not); an unreadable MP4 is not treated as AAC and is not indexed. A lossy file that shares a folder + disc/track (or stem) with a lossless sibling is skipped so leftover transcode copies do not become duplicate tracks. After finalize, albums cache a lossy kind (`mp3` / `aac` / `lossy` / `mixed` / none) using the same reduce the client uses for title marks, and a total duration that is null when any present track lacks `duration_ms`. All library jobs (scan and regen) share a **single-flight** runner with cancel support and persisted `ScanState` progress. HTTP, CLI (local or via UDS), and startup use the same runner (`_begin` writes the running row once). Kind dispatch is `scan/jobs.py` (`run_scan` / `regen_*`). Lyrics still collects missing/non-ok, fingerprint-mismatch (pass1b), and sidecar upgrades. Radio catalog invalidation reads `last_scan_finished_at` (`ScanState` / `radio_repo.scan_finished_at`), not the last job kind.

## Modes and kinds

| Mode | Intent |
|------|--------|
| **quick** | Incremental refresh (startup default): notice new/changed/missing material efficiently |
| **full** | Deeper re-index; rebuilds FTS; forces covers, artist images, and lyrics enrichment |

| Job kind | Intent |
|----------|--------|
| **scan** | Full pipeline (walk → finalize → enrichment) |
| **regen-covers** / **regen-artist-images** / **regen-lyrics** | Enrichment-only (DB-driven cover paths; no re-walk) |

Exact skip/rehash heuristics live in source; docs only state the product intent.

## Pipeline (conceptual)

1. Walk eligible indexable files (lossless, plus MP3/AAC when the flag is on). Skip a lossy file when a lossless sibling exists in the same folder.
2. Fingerprint / identity resolution → stable track IDs.
3. Batch upsert track and graph metadata (tags, audio tech for later encode policy). Scan stores the file’s average/nominal bitrate and, for MP3 and AAC, an encoding mode when it can tell. MP3 mode comes from the file header. AAC-in-m4a compares the MP4 `esds` max vs average bitrate (equal → CBR, max higher → VBR; otherwise leave empty). A **full** scan fills existing libraries; quick scan does not re-read unchanged files.
4. Cover extraction to durable WebP under the data dir (missing art).
5. Artist portrait fetch cascade for artists still missing images (local file → remote providers when configured).
6. Lyrics fetch for tracks still missing lyrics (local sidecars → LRCLIB).
7. Mark missing paths, recount entity aggregates (including album total duration from present tracks; store null when any present track lacks duration), FTS maintenance as required by mode.

## Enrichment policies

- **Covers:** embedded art or common folder filenames; `CoverStore` extracts, `WebpAssetStore` owns has/path and writes full + thumb WebP.
- **Artist images:** optional remote providers need keys/email in env; local `artist.jpg` / `artist.png` works without keys. Rate limits and retry cooldowns are source constants in `config.py`. Scan writes only `covers/artists/`. An operator override may live beside that pair under `covers/artists-preferred/`; fetch and `--force` must not delete it. `GET /api/artist-image` serves the override first (`artist_images/resolve.py`). Artist-image and lyrics commit loops share `iter_enrichment`. **VA** (the single Various Artists compilation owner) is skipped: no local file, no remote fetch, no preferred upload, even under `--force`. `GET /api/artist-image` short-circuits to the packaged Aero portrait (`musicweb.images.va_portrait`).
- **Lyrics:** LRCLIB needs no API key; retries/cooldowns are source constants. Local sidecar presence is `sidecar_lrc_exists`.

## Various Artists (VA)

Compilations whose **album artist** (whole field; today’s fallback is still `albumartist or artist`) matches the closed alias set fold to one artist displayed **Various Artists**. Matcher and well-known id live in `src/musicweb/db/va.py` — do not copy the alias inventory into docs. `ensure_artist` canonicalizes on write. Every `run_scan` (startup quick included) remounts already-indexed alias rows in SQL without re-reading files (`src/musicweb/scan/va_remount.py`); regen-only jobs do not remount. Same-title comps under former aliases merge (`album_id` follows the new owner). Preferred files under `covers/artists-preferred/` stay sacred.

A **VA-only performer** appears only as a track artist on VA albums and owns no albums. They stay off the Artists list and have no artist page; their tracks stay in Search. Anyone with `album_count == 0` 404s on `GET /api/artists/{id}`.

## Guardrails

- One library job at a time; start returns failure/false if already running.
- Do not perform heavy scan work on the request thread (HTTP starts the job thread).
- Prefer fingerprint identity over path identity for playlists and clients.
- Outbound fetch must respect configured intervals; never log API secrets.
- Cancel should be cooperative between phases — check the cancel event in long loops.
- CLI write jobs go through the job runner (local exclusive or control RPC) — not ad-hoc phase calls.
