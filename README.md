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

Press **Ctrl+C** for a clean shutdown. The temporary transcode cache is always deleted on exit.

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
- Tags via mutagen (title, artist, album, duration)
- Selectable **Codec** profiles (player bar; default AAC):
  - **`aac_256_44100`** — AAC-LC VBR ~256 kbps @ **44.1 kHz**
  - **`opus_192_48000`** — Opus VBR 192 kbps @ **48 kHz**
  - **`opus_160_48000`** — Opus VBR 160 kbps @ **48 kHz**
  - **`flac_16_44100`** — FLAC 16-bit @ **44.1 kHz** (lossless stream)
  - **`flac_16_48000`** — FLAC 16-bit @ **48 kHz** (lossless stream)
- On-demand single-pass ffmpeg encode; process cache wiped on shutdown
- No authentication (LAN trust only — do not expose to the public internet)

## Notes

- Source library is expected to be lossless (FLAC, ALAC in `.m4a`).
- **Stream URL:** `/api/stream?path=…&codec=aac_256_44100|opus_192_48000|opus_160_48000|flac_16_44100|flac_16_48000`
- **AAC encoder selection** (startup): prefer **`aac_at`** (Apple) when present, else **`libfdk_aac`**. Fail if neither is available. The chosen encoder is logged in the startup banner.
- **Transcode path** (one ffmpeg process):
  1. `aresample=resampler=soxr:precision=28:cutoff=0.95:dither_method=shibata` (≈ SoX `rate -v` + Shibata dither)
  2. Force 16-bit + profile sample rate (`-sample_fmt s16 -ar …`)
  3. Encode AAC, Opus, or FLAC into a tagged cache file (FLAC uses ffmpeg default compression; level is not set)
  4. When the source sample rate already matches the target, ffmpeg **skips** the rate-conversion step (format/dither may still apply)
- Cache filenames include the profile tag, e.g. `{hash}.aac_256_44100.m4a`, `{hash}.opus_192_48000.opus`, `{hash}.flac_16_44100.flac`
- Concurrent requests for the same track+profile share one encode
- Seeking uses HTTP Range on completed cache files
