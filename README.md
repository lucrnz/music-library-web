# Music Library Web Server

Browse and stream a lossless music library over your LAN. Foobar2000-inspired UI: **filesystem tree on the left**, **playlist on the right**, with live **Opus VBR 192 kbps** transcoding via ffmpeg.

The library browser is **filesystem-agnostic**: it only needs `MUSIC_LIBRARY_PATH`. It discovers whatever directories and audio files exist under that root (lazy tree, one level at a time). No hard-coded folder names or library schema.

## Requirements

- Python 3.11+ (developed with uv)
- [uv](https://github.com/astral-sh/uv)
- [ffmpeg](https://ffmpeg.org/) with `libopus` on your `PATH` (includes `ffprobe`)
- [SoX](http://sox.sourceforge.net/) on your `PATH` (high-quality resample when needed)

On macOS with Homebrew: `brew install ffmpeg sox`

The server checks for **ffmpeg**, **ffprobe**, and **sox** at startup and refuses to start if any are missing.

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

On start the terminal prints the listen address, for example:

```
Listening on http://0.0.0.0:8765
LAN URL : http://192.168.x.x:8765
```

Press **Ctrl+C** for a clean shutdown. The temporary Opus transcode cache is always deleted on exit.

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
- On-demand transcode to Opus; cache kept for the server process; wiped on shutdown
- Conditional high-quality resample (SoX) only when the source is **not** already 16-bit / 44.1 kHz
- No authentication (LAN trust only — do not expose to the public internet)

## Notes

- Source library is expected to be lossless (FLAC, ALAC in `.m4a`).
- **Transcode path**
  1. `ffprobe` reads sample rate + bit depth.
  2. If already **16-bit / 44.1 kHz** → `ffmpeg` encodes Opus VBR 192 kbps directly.
  3. Otherwise → SoX HQ intermediate (`sox in -b 16 -r 44100 out.flac rate -v -L dither -s`), then `ffmpeg` → Opus.
  4. Formats SoX cannot open (e.g. ALAC `.m4a`) are decoded to FLAC with `ffmpeg` first, then SoX.
- Transcoding uses a temp directory under the system temp path; concurrent requests for the same track share one encode. Intermediate FLAC files are removed after the Opus file is written; the Opus cache is wiped on shutdown.
- Seeking uses HTTP Range on completed Opus files.
