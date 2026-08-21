# Library scan

## Source of truth

- Job orchestration (scan + regen kinds): `src/musicweb/jobs/runner.py` (one `_begin`; `_progress` logs; a completed scan writes `last_scan_finished_at` for radio via `radio_repo.scan_finished_at`)
- Walk / formats: `src/musicweb/scan/walk.py`, `formats.py`
- Album lossy-kind reduce: `src/musicweb/scan/lossy_kind.py` (finalize SQL is a cache of the same reduce)
- Fingerprints / identity: `src/musicweb/scan/fingerprint.py`, `identity.py`
- Batch upsert: `src/musicweb/scan/batch.py`
- Covers / artist images / lyrics phases: `scan/covers.py`, `scan/artist_images.py`, `scan/lyrics.py`
- Finalize (missing + counts): `src/musicweb/scan/finalize.py`
- HTTP triggers: `src/musicweb/routes/library_scan.py`
- CLI: `src/musicweb/cli/`; live control plane: `src/musicweb/control/`

## Purpose

Build and refresh the SQLite index from the files under `MUSIC_LIBRARY_PATH` without blocking the HTTP server. The walk is **indexable** audio: packed lossless always, plus MP3/AAC when `MUSICWEB_INDEX_LOSSY` is on. Eligibility classifies a file once (lossless / lossy / not); an unreadable MP4 is not treated as AAC and is not indexed. A lossy file that shares a folder + disc/track (or stem) with a lossless sibling is skipped so leftover transcode copies do not become duplicate tracks. After finalize, albums cache a lossy kind (`mp3` / `aac` / `lossy` / `mixed` / none) using the same reduce the client uses for title marks. All library jobs (scan and regen) share a **single-flight** runner with cancel support and persisted `ScanState` progress. HTTP, CLI (local or via UDS), and startup use the same runner (`_begin` writes the running row once). Radio catalog invalidation reads `last_scan_finished_at` (`ScanState` / `radio_repo.scan_finished_at`), not the last job kind.

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
7. Mark missing paths, recount entity aggregates, FTS maintenance as required by mode.

## Enrichment policies

- **Covers:** embedded art or common folder filenames; stored once as full + thumb WebP.
- **Artist images:** optional remote providers need keys/email in env; local `artist.jpg` / `artist.png` works without keys. Rate limits and retry cooldowns are source constants in `config.py`. Scan writes only `covers/artists/`. An operator override may live beside that pair under `covers/artists-preferred/`; fetch and `--force` must not delete it. `GET /api/artist-image` serves the override first (`artist_images/resolve.py`).
- **Lyrics:** LRCLIB needs no API key; retries/cooldowns are source constants.

## Guardrails

- One library job at a time; start returns failure/false if already running.
- Do not perform heavy scan work on the request thread (HTTP starts the job thread).
- Prefer fingerprint identity over path identity for playlists and clients.
- Outbound fetch must respect configured intervals; never log API secrets.
- Cancel should be cooperative between phases — check the cancel event in long loops.
- CLI write jobs go through the job runner (local exclusive or control RPC) — not ad-hoc phase calls.
