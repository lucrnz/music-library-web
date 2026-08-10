# Library scan

## Source of truth

- Scanner orchestration: `src/musicweb/scan/scanner.py`
- Walk / formats: `src/musicweb/scan/walk.py`, `formats.py`
- Fingerprints / identity: `src/musicweb/scan/fingerprint.py`, `identity.py`
- Batch upsert: `src/musicweb/scan/batch.py`
- Covers / artist images / lyrics phases: `scan/covers.py`, `scan/artist_images.py`, `scan/lyrics.py`
- Finalize (missing + counts): `src/musicweb/scan/finalize.py`
- HTTP triggers: `src/musicweb/routes/library_scan.py`

## Purpose

Build and refresh the SQLite index from the lossless files under `MUSIC_LIBRARY_PATH` without blocking the HTTP server. Scan runs on a **single background thread** with cancel support and persisted `ScanState` progress.

## Modes

| Mode | Intent |
|------|--------|
| **quick** | Incremental refresh (startup default): notice new/changed/missing material efficiently |
| **full** | Deeper re-index path; rebuilds FTS as part of a thorough pass |

Exact skip/rehash heuristics live in source; docs only state the product intent.

## Pipeline (conceptual)

1. Walk eligible lossless files.
2. Fingerprint / identity resolution → stable track IDs.
3. Batch upsert track and graph metadata (tags, audio tech for later encode policy).
4. Cover extraction to durable WebP under the data dir (missing art).
5. Artist portrait fetch cascade for artists still missing images (local file → remote providers when configured).
6. Lyrics fetch for tracks still missing lyrics (local sidecars → LRCLIB).
7. Mark missing paths, recount entity aggregates, FTS maintenance as required by mode.

## Enrichment policies

- **Covers:** embedded art or common folder filenames; stored once as full + thumb WebP.
- **Artist images:** optional remote providers need keys/email in env; local `artist.jpg` / `artist.png` works without keys. Rate limits and retry cooldowns are source constants in `config.py`.
- **Lyrics:** LRCLIB needs no API key; retries/cooldowns are source constants.

## Guardrails

- One scanner at a time; start returns failure/false if already running.
- Do not perform heavy scan work on the request thread.
- Prefer fingerprint identity over path identity for playlists and clients.
- Outbound fetch must respect configured intervals; never log API secrets.
- Cancel should be cooperative between phases — check the cancel event in long loops.
