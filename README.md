# Music Library Web Server

Browse and stream a lossless music library over your LAN. Foobar2000-inspired UI: **filesystem tree on the left**, **playlist on the right**, with live dual-codec transcoding via **ffmpeg** (libsoxr HQ resample + AAC or Opus).

The library browser is **filesystem-agnostic**: it only needs `MUSIC_LIBRARY_PATH`. It discovers whatever directories and audio files exist under that root (lazy tree, one level at a time). No hard-coded folder names or library schema.

## Requirements

- Python 3.11+ (developed with uv)
- [uv](https://github.com/astral-sh/uv)
- [ffmpeg](https://ffmpeg.org/) on your `PATH`, built with:
  - **libsoxr** (`--enable-libsoxr`) — high-quality resampling
  - **libopus** — mobile Opus profile
  - **aac_at** (macOS AudioToolbox) **or** **libfdk_aac** (`--enable-libfdk-aac --enable-nonfree`) — desktop AAC profile

On macOS with Homebrew, a non-free ffmpeg build that includes FDK + libsoxr is typical. The server **refuses to start** if libsoxr, libopus, or a usable AAC encoder is missing. It does **not** require a separate SoX package.

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
```

Press **Ctrl+C** for a clean shutdown. The temporary transcode cache is always deleted on exit.

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `MUSIC_LIBRARY_PATH` | — | Root directory to browse (required in practice) |
| `LISTEN` | `0.0.0.0` | Bind address |
| `PORT` | `8765` | TCP port |

## Features

- Lazy file-tree browser (dirs + `.flac` / `.m4a` only)
- Browser session playlist (multi-select, drag reorder, remove, clear)
- Play / pause / next / prev, seek, volume
- Shuffle, repeat off / one / all
- Cover art: embedded (ffmpeg) or folder `cover.jpg` / `cover.png` / etc.
- Tags via mutagen (title, artist, album, duration)
- Selectable **Codec** profiles (player bar):
  - **`aac_256_44100`** — AAC-LC VBR ~256 kbps @ **44.1 kHz** (recommended for desktop)
  - **`opus_192_48000`** — Opus VBR 192 kbps @ **48 kHz** (recommended for mobile)
- On-demand single-pass ffmpeg encode; process cache wiped on shutdown
- No authentication (LAN trust only — do not expose to the public internet)

## Notes

- Source library is expected to be lossless (FLAC, ALAC in `.m4a`).
- **Stream URL:** `/api/stream?path=…&codec=aac_256_44100|opus_192_48000`
- **AAC encoder selection** (startup): prefer **`aac_at`** (Apple) when present, else **`libfdk_aac`**. Fail if neither is available. The chosen encoder is logged in the startup banner.
- **Transcode path** (one ffmpeg process):
  1. `aresample=resampler=soxr:precision=28:cutoff=0.95:dither_method=shibata` (≈ SoX `rate -v` + Shibata dither)
  2. Force 16-bit + profile sample rate (`-sample_fmt s16 -ar …`)
  3. Encode AAC or Opus into a tagged cache file
  4. When the source sample rate already matches the target, ffmpeg **skips** the rate-conversion step (format/dither may still apply)
- Cache filenames include the profile tag, e.g. `{hash}.aac_256_44100.m4a`, `{hash}.opus_192_48000.opus`
- Concurrent requests for the same track+profile share one encode
- Seeking uses HTTP Range on completed cache files
