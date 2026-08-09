# Music Library Web Server

Browse and stream a lossless music library over your LAN. Modern mobile-first web UI (Spotify/YT-Music style): **Folders / Artists / Albums** discovery, **session queue**, **saved playlists**, a mini-player that expands into a full now-playing sheet on phones, and a two-pane layout with a persistent player bar on desktop. Live multi-codec transcoding via **ffmpeg** (libsoxr HQ resample + AAC, Opus, or FLAC).

The media tree is **filesystem-agnostic** (`MUSIC_LIBRARY_PATH`). A SQLAlchemy/SQLite **index** under `MUSICWEB_DATA_DIR` powers Artist → Album → Track browsing, FTS5 search, stable track IDs (content fingerprints), re-scan, and durable playlists.

## Requirements

- Python 3.11+ (developed with uv)
- [uv](https://github.com/astral-sh/uv)
- [ffmpeg](https://ffmpeg.org/) on your `PATH`, built with:
  - **libsoxr** (`--enable-libsoxr`) — high-quality resampling
  - **libopus** — Opus profile
  - **flac** — lossless FLAC profiles (built into standard ffmpeg)
  - **aac_at** (macOS AudioToolbox) **or** **libfdk_aac** (`--enable-libfdk-aac --enable-nonfree`) — AAC profile

On macOS with Homebrew, a non-free ffmpeg build that includes FDK + libsoxr is typical. The server **refuses to start** if libsoxr, libopus, flac, or a usable AAC encoder is missing. It does **not** require a separate SoX package.

## Setup

```bash
cd WebServer
cp .env.example .env
# Edit .env — set MUSIC_LIBRARY_PATH to your library root
uv sync
```

## Run

```bash
uv run musicweb
```

Or:

```bash
uv run python -m musicweb
```

On start the terminal prints the listen address and selected tools, for example:

```
Listening on http://0.0.0.0:8765
LAN URL : http://192.168.x.x:8765
Tools   :
  - ffmpeg: ...
  - libsoxr: enabled (aresample resampler=soxr)
  - aac encoder: aac_at (Apple AudioToolbox)
  - opus encoder: libopus
  - flac encoder: flac
```

Press **Ctrl+C** for a clean shutdown. Temporary caches live under one process root (`streams/` + `covers/`) and are always deleted on exit.

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `MUSIC_LIBRARY_PATH` | — | Root directory of media files (required in practice) |
| `MUSICWEB_DATA_DIR` | `./data` | Directory for `library.db` + persisted `covers/` (not a single `.db` file path) |
| `LISTEN` | `0.0.0.0` | Bind address |
| `PORT` | `8765` | TCP port |

### Data directory layout

```text
$MUSICWEB_DATA_DIR/
  library.db                 # SQLite index (SQLAlchemy, WAL)
  covers/albums/{album_id}.full.webp
  covers/albums/{album_id}.thumb.webp
```

## Features

- Mobile-first responsive UI: bottom tabs + mini-player/now-playing sheet on phones; side-by-side library/playlist panes + player bar on desktop (≥900px)
- **Browse modes:** Folders, **Artists → Albums → Tracks**, **Albums** cover grid, **Search** (FTS5)
- **SQLite index** (SQLAlchemy 2 + Alembic migrations): artists, albums, tracks, playlists, FTS5
- **Stable track IDs** from content fingerprints (FLAC STREAMINFO MD5; other lossless: SHA-256); renames reattach when fingerprint matches
- **Incremental scan on startup** + Settings: **Quick rescan**, **Full re-index**, progress, cancel (full scan rebuilds FTS)
- Lossless formats: `.flac`, ALAC in `.m4a`, `.wav`, `.aiff`/`.aif` (AAC `.m4a` is not indexed)
- Session **queue** (browser sessionStorage) + **saved playlists** in SQLite (shared across LAN devices)
- Play / pause / next / prev, seek, volume, shuffle, repeat
- Cover art: embedded (ffmpeg) or folder `cover.jpg` / `cover.png` / etc., encoded once to WebP under the data dir (survives restarts)
  - Full ≈ 1000×1000 lossless WebP; thumb 200×200 quality 90
  - `/api/cover?album_id=…&size=full|thumb` or `track_id=…`
- Tags via mutagen (title, artist, album, album artist, track, disc, year, duration)
- Selectable **Codec** profiles (default AAC). Settings only lists formats this browser can **actually decode** (tiny silent fixtures loaded into a muted `Audio` element — not `canPlayType` / UA sniffing; e.g. ALAC is typically Safari-only):
  - **`aac_256_44100`** — AAC-LC VBR ~256k 44.1kHz
  - **`aac_256_48000`** — AAC-LC VBR ~256k 48kHz
  - **`opus_192_48000`** — Opus 192k 48kHz
  - **`opus_160_48000`** — Opus 160k 48kHz
  - **`alac_16_44100`** — ALAC 16-bit 44.1kHz
  - **`alac_16_48000`** — ALAC 16-bit 48kHz
  - **`alac_24_96000`** — ALAC 24-bit 96kHz
  - **`flac_16_44100`** — FLAC 16-bit 44.1kHz
  - **`flac_16_48000`** — FLAC 16-bit 48kHz
  - **`flac_24_96000`** — FLAC 24-bit 96kHz
- On-demand ffmpeg encode (libsoxr VHQ resample) into process temp `streams/` (wiped on shutdown)
- No authentication (LAN trust only — do not expose to the public internet)

## Library index API (summary)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/library/stats` | Counts |
| `POST /api/library/scan` | `{ "mode": "quick" \| "full" }` |
| `POST /api/library/scan/cancel` | Cancel running scan |
| `GET /api/library/scan/status` | Progress / last result |
| `GET /api/artists`, `/api/artists/{id}/albums` | Discovery |
| `GET /api/albums`, `/api/albums/{id}/tracks` | Discovery |
| `GET /api/tracks/{id}`, `POST /api/tracks/meta` | Track by id |
| `GET /api/search?q=` | FTS5 + artist/album LIKE |
| `GET /api/browse`, `/api/collect` | Folders (+ track `id` when indexed) |
| `GET /api/stream?id=…&codec=…` | Stream by track id (path still accepted) |
| `GET /api/cover?album_id=…` / `track_id=…` | Persisted WebP |
| `/api/playlists` CRUD + tracks | Saved playlists by track id |

## Notes

- Source library is expected to be **lossless**.
- **Stream URL:** `/api/stream?id={track_id}&codec=…` (id required)
- **Cover URL:** `/api/cover?album_id=…` or `?track_id=…`
- **Prewarm:** `POST /api/transcode/prepare` with `{"ids": [...], "codec": "…", "replace": false}`
- **AAC encoder selection** (startup): prefer **`aac_at`** (Apple) when present, else **`libfdk_aac`**. Fail if neither is available. Also requires **libopus**, **flac**, and **alac** encoders plus **libsoxr**.
- **Transcode path** (one ffmpeg process):
  1. `aresample=resampler=soxr:precision=28:cutoff=0.95:dither_method=shibata`
  2. Force 16-bit + profile sample rate
  3. Encode AAC, Opus, or FLAC into a tagged cache file
  4. Skip rate conversion when source rate already matches the target
- Stream cache under process temp `streams/`; clear with `POST /api/cache/clear?scope=streams`
- Concurrent requests for the same track+profile share one encode
- Single encode worker: play requests preempt prewarm; `.partial` never served
- Seeking uses HTTP Range on completed cache files

## Schema migrations

Schema migrations live under `src/musicweb/db/migrations/`. Startup runs Alembic to head (or stamps head if an older pre-Alembic DB is detected). Optional CLI: `alembic upgrade head`.
