# Music Library Web Server

Browse and stream a lossless music library over your LAN. Modern mobile-first web UI (Spotify/YT-Music style): **drill-down library browser**, **playlist**, a mini-player that expands into a full now-playing sheet on phones, and a two-pane layout with a persistent player bar on desktop. Live multi-codec transcoding via **ffmpeg** (libsoxr HQ resample + AAC, Opus, or FLAC).

The library browser is **filesystem-agnostic**: it only needs `MUSIC_LIBRARY_PATH`. It discovers whatever directories and audio files exist under that root (lazy tree, one level at a time). No hard-coded folder names or library schema.

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
| `MUSIC_LIBRARY_PATH` | — | Root directory to browse (required in practice) |
| `LISTEN` | `0.0.0.0` | Bind address |
| `PORT` | `8765` | TCP port |

## Features

- Mobile-first responsive UI: bottom tabs + mini-player/now-playing sheet on phones; side-by-side library/playlist panes + player bar on desktop (≥900px)
- Drill-down folder browser (dirs + `.flac` / `.m4a` only); tap-to-play, per-row add, "Add all" per folder, desktop Ctrl/Cmd multi-select
- Browser session playlist (tap to play, edit mode: remove, touch/mouse drag reorder, clear)
- Play / pause / next / prev, seek, volume
- Shuffle, repeat off / one / all
- Cover art: embedded (ffmpeg) or folder `cover.jpg` / `cover.png` / etc., always served as WebP
  - Now-playing sheet: 800×800 lossless WebP (LANCZOS resize) via `/api/cover?path=…&size=full`
  - Mini-player / playlist thumbnails: 200×200 WebP quality 90 via `/api/cover?path=…&size=thumb`
  - **Album-keyed process cache**: tracks that share the same album *title* tag share one full + thumbnail WebP pair (extracted once, ready to serve). No album tag → per-file key. Stored under the process cache `covers/` subdir (same root as streams; wiped on shutdown)
- Tags via mutagen (title, artist, album, duration)
- Selectable **Codec** profiles (player bar; default AAC):
  - **`aac_256_44100`** — AAC 256k 44.1kHz
  - **`opus_192_48000`** — Opus 192k 48kHz
  - **`opus_160_48000`** — Opus 160k 48kHz
  - **`flac_16_44100`** — FLAC 44.1kHz
  - **`flac_16_48000`** — FLAC 48kHz
- On-demand single-pass ffmpeg encode into `<cache>/streams/`; process cache wiped on shutdown
- Session caches share one root (`streams/`, `covers/`). Scoped clear: `POST /api/cache/clear?scope=streams` (playlist clear), `?scope=covers`, or both (`?scope=streams&scope=covers`)
- No authentication (LAN trust only — do not expose to the public internet)

## Notes

- Source library is expected to be lossless (FLAC, ALAC in `.m4a`).
- **Stream URL:** `/api/stream?path=…&codec=aac_256_44100|opus_192_48000|opus_160_48000|flac_16_44100|flac_16_48000`
- **Prewarm URL:** `POST /api/transcode/prepare` with `{"paths": [...], "codec": "…", "replace": false}` — queues background transcodes (deduped, pending queue capped at 300; `replace: true` drops all pending prewarm jobs, used on codec change). Returns per-status counts. The frontend fires this when tracks are added to the playlist and for the whole playlist after a codec change.
- **AAC encoder selection** (startup): prefer **`aac_at`** (Apple) when present, else **`libfdk_aac`**. Fail if neither is available. The chosen encoder is logged in the startup banner.
- **Transcode path** (one ffmpeg process):
  1. `aresample=resampler=soxr:precision=28:cutoff=0.95:dither_method=shibata` (≈ SoX `rate -v` + Shibata dither)
  2. Force 16-bit + profile sample rate (`-sample_fmt s16 -ar …`)
  3. Encode AAC, Opus, or FLAC into a tagged cache file (FLAC uses ffmpeg default compression; level is not set)
  4. When the source sample rate already matches the target, ffmpeg **skips** the rate-conversion step (format/dither may still apply)
- Stream cache filenames live under `<cache>/streams/` and include the profile tag, e.g. `{hash}.aac_256_44100.m4a`, `{hash}.opus_192_48000.opus`, `{hash}.flac_16_44100.flac`
- **Cache clear:** `POST /api/cache/clear?scope=streams` and/or `?scope=covers` (required; repeat for both). Response: `{"removed": {"streams": N, …}, "scopes": […]}`
- Concurrent requests for the same track+profile share one encode
- All encodes run on a single background worker (serial by design — encodes are CPU-bound) fed by a two-tier queue: play requests first (newest first), then prewarm requests (FIFO). A play request promotes its queued job, or preempts a running prewarm encode — the `.partial` file is deleted (never renamed, so nothing corrupt is ever served) and the canceled job restarts after the urgent work
- Seeking uses HTTP Range on completed cache files
