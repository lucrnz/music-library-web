# Music Library Web Server

> **Disclaimer:** This project has been developed heavily with AI-assisted tools. The developer does not guarantee production readiness, stability, or security. Use it at your own risk. Scope is driven solely by the developer’s interests; pull requests and feature requests are not accepted.

Browse and stream a lossless music library over your LAN. Modern mobile-first web UI (Spotify/YT-Music style): **Folders / Artists / Albums** discovery, **session queue**, **saved playlists**, a mini-player that expands into a full now-playing sheet on phones, and a two-pane layout with a persistent player bar on desktop. Live multi-codec transcoding via **ffmpeg** (libsoxr HQ resample + **Opus** or **FLAC**).

The media tree is **filesystem-agnostic** (`MUSIC_LIBRARY_PATH`). A SQLAlchemy/SQLite **index** under `MUSICWEB_DATA_DIR` powers Artist → Album → Track browsing, FTS5 search, stable track IDs (content fingerprints), re-scan, and durable playlists.

## Audio quality principles

**High-fidelity streaming is a primary goal.** Whenever audio is resampled or re-encoded for the browser, this project prefers settings that match studio / mastering-grade practice over “good enough” OS or consumer defaults.

Examples:

- **Resampling:** libsoxr via ffmpeg at SoX Very High Quality equivalents (`rate -v -L`: `precision=28`, linear phase, `cutoff=0.95`) — not the OS mixer’s cheap resampler.
- **Dither:** Shibata (`dither -s`) **only when reducing bit depth** (e.g. 24-bit source → 16-bit Opus/FLAC). **Never** dither when increasing bit depth (16 → 24) or when depth is unchanged. If sample rate and bit depth already match the stream profile, aresample is skipped entirely.
- **Encoders:** best practical quality knobs for each codec (e.g. Opus VBR at the selected bitrate; FLAC with true 24-bit when that profile is chosen).
- **Source library:** packed lossless only (**FLAC** and **ALAC**); the pipeline should not needlessly degrade it before the chosen stream format.

Tweaking small pipeline details for transparent, high-fidelity delivery is intentional and preferred over simpler lower-quality paths.

## Requirements

- Python 3.11+ (developed with uv)
- [uv](https://github.com/astral-sh/uv)
- [ffmpeg](https://ffmpeg.org/) on your `PATH`, built with:
  - **libsoxr** (`--enable-libsoxr`) — high-quality resampling
  - **libopus** — Opus profiles
  - **flac** — lossless FLAC profiles (built into standard ffmpeg)

The server **refuses to start** if libsoxr, libopus, or flac is missing. It does **not** require a separate SoX package.

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
  - opus encoder: libopus
  - flac encoder: flac
```

Press **Ctrl+C** for a clean shutdown. Temporary stream caches under the process root are always deleted on exit.

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `MUSIC_LIBRARY_PATH` | — | Root directory of media files (required in practice) |
| `MUSICWEB_DATA_DIR` | `./data` | Directory for `library.db` + persisted `covers/` (not a single `.db` file path) |
| `LISTEN` | `0.0.0.0` | Bind address |
| `PORT` | `8765` | TCP port |
| `LASTFM_API_KEY` | empty | Optional Last.fm API key for artist portraits |
| `FANART_TV_API_KEY` | empty | Optional fanart.tv personal API key for artist portraits |
| `MUSICBRAINZ_CONTACT_EMAIL` | empty | Contact email for MusicBrainz User-Agent (required for MB + fanart.tv MBID path) |

Artist image fetch tuning (interval, retry cooldown, on/off) lives in source (`musicweb/config.py`), not env.

### Data directory layout

```text
$MUSICWEB_DATA_DIR/
  library.db                 # SQLite index (SQLAlchemy, WAL)
  covers/albums/{album_id}.full.webp
  covers/albums/{album_id}.thumb.webp
  covers/artists/{artist_id}.full.webp
  covers/artists/{artist_id}.thumb.webp
```

## Frontend

Vue 3 + Vue Router (ESM browser builds), **no bundler / no Node**. Pinned packages live in `musicweb/vendor_deps.py` and are **downloaded from unpkg into `static/vendor/` on startup** (skipped when the local manifest already matches). The Jinja shell loads them via import map. First run (or after a version bump) needs network; afterward the server can start offline. Client routes (`/folders`, `/artists/…`, `/albums/…`, `/search`, `/queue`) are served by a FastAPI SPA fallback so refresh works.

To upgrade Vue/Router: edit versions and URLs in `vendor_deps.py`, restart — the new builds are fetched automatically.

## Features

- Mobile-first responsive UI: bottom tabs + mini-player/now-playing sheet on phones; side-by-side library/playlist panes + player bar on desktop (≥900px)
- **Browse modes:** Folders, **Artists → Albums → Tracks**, **Albums** cover grid, **Search** (FTS5); bookmarkable client routes
- **SQLite index** (SQLAlchemy 2 + Alembic migrations): artists, albums, tracks, playlists, FTS5
- **Stable track IDs** from content fingerprints (FLAC STREAMINFO MD5; other lossless: SHA-256); renames reattach when fingerprint matches
- **Incremental scan on startup** + Settings: **Quick rescan**, **Full re-index**, progress, cancel (full scan rebuilds FTS)
- Packed lossless only: `.flac`, ALAC in `.m4a`/`.mp4` (WAV/AIFF and AAC `.m4a` are not indexed)
- Session **queue** (browser sessionStorage) + **saved playlists** in SQLite (shared across LAN devices)
- Play / pause / next / prev, seek, volume, shuffle, repeat
- Cover art: embedded (ffmpeg) or folder `cover.jpg` / `cover.png` / etc., encoded once to WebP under the data dir (survives restarts)
  - Full ≈ 1000×1000 lossless WebP; thumb 200×200 quality 90
  - `/api/cover?album_id=…&size=full|thumb` or `track_id=…`
- Artist portraits on re-scan (missing only): local `artist.jpg` / `artist.png` → MusicBrainz → Last.fm → fanart.tv (APIs only)
  - Stored as WebP under `covers/artists/`; `/api/artist-image?artist_id=…&size=full|thumb`
  - Shown as thumbs on Artists list and search
- Tags via mutagen (title, artist, album, album artist, track, disc, year, duration)
- Selectable **Codec** profiles (default Opus 192). Settings only lists formats this browser can **actually decode** (tiny silent fixtures loaded into a muted `Audio` element — not `canPlayType` / UA sniffing):
  - **`opus_192_48000`** — Opus 192k 48kHz (**default**)
  - **`opus_160_48000`** — Opus 160k 48kHz
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
| `GET /api/cover?album_id=…` / `track_id=…` | Persisted album cover WebP |
| `GET /api/artist-image?artist_id=…&size=…` | Persisted artist portrait WebP |
| `/api/playlists` CRUD + tracks | Saved playlists by track id |

## Notes

- Source library is expected to be **lossless**.
- **Stream URL:** `/api/stream?id={track_id}&codec=…` (id required)
- **Cover URL:** `/api/cover?album_id=…` or `?track_id=…`
- **Prewarm:** `POST /api/transcode/prepare` with `{"ids": [...], "codec": "…", "replace": false}`
- Startup requires **libopus**, **flac**, and **libsoxr** (no AAC encoder).
- **Transcode path** (one ffmpeg process):
  1. If source rate **and** bit depth already match the profile → **no aresample**
  2. Else soxr VHQ (`precision=28`, `cutoff=0.95`); add `dither_method=shibata` **only** when source bit depth **>** profile bit depth
  3. Force sample format + profile sample rate (16-bit for Opus / FLAC 16; 24-bit for high-rate FLAC)
  4. Encode Opus or FLAC into a tagged cache file
  Source rate/depth are stored on tracks at scan time (and probed at encode if missing).
- Stream cache under process temp `streams/`; clear with `POST /api/cache/clear?scope=streams`
- Concurrent requests for the same track+profile share one encode
- Single encode worker: play requests preempt prewarm; `.partial` never served
- Seeking uses HTTP Range on completed cache files

## Schema migrations

Schema migrations live under `src/musicweb/db/migrations/`. Startup runs Alembic to head (or stamps head if an older pre-Alembic DB is detected). Optional CLI: `alembic upgrade head`.

## License

This project is licensed under the [MIT License](LICENSE).
