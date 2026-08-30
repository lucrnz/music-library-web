# Setup

Operator on-ramp for running Musicweb on your network. For the full command reference, environment roles, and system design, use the links at the end.

## Prerequisites

The library server runs on **Windows and macOS** for the core loop (serve, scan, stream, radio HTTP, doctor, live CLI). Exclusive hog is a Windows and macOS companion feature; CD playback stays macOS-only. Support is best-effort; the project is NO WARRANTY.

- **Python 3.11+** and [uv](https://github.com/astral-sh/uv)
- **Node 20+** and [pnpm](https://pnpm.io/) (SPA lives under `frontend/`)
- **ffmpeg** and **ffprobe** on `PATH`, ffmpeg built with **libsoxr**, **libopus**, and **flac** (the server and `musicweb doctor` refuse to start if those are missing). On Windows use a **full** build (for example gyan “full”), not a slim package that omits libsoxr.
- A music library root (any folder layout). Packed lossless (FLAC/ALAC) is indexed by default. MP3/AAC in the tree are ignored unless `MUSICWEB_INDEX_LOSSY` is on. On Windows, set `MUSIC_LIBRARY_PATH` to an absolute path (`C:\Music`).

## Configure

```sh
cp .env.example .env
```

Edit `.env` and set at least:

- `MUSIC_LIBRARY_PATH` — absolute path to your library root
- Optional: `MUSICWEB_DATA_DIR`, `LISTEN`, `PORT`
- Optional: `MUSICWEB_PUBLIC_ORIGIN` — the URL clients should open for day-to-day use and PWA install (must be a secure context; see below)

Details and variable roles: [development/environment.md](./development/environment.md). Template comments: [`.env.example`](../.env.example).

## Run

```sh
uv sync
pnpm --dir frontend install
pnpm --dir frontend build
uv run musicweb
```

Bare `musicweb` serves HTTP (same as `musicweb serve`). On start the process validates paths, ffmpeg, and ffprobe, requires `frontend/dist`, applies migrations, starts a quick library scan, and starts the household radio clock. `musicweb doctor` fails if the frontend dist or ffprobe is missing.

More entrypoints (`scan`, `stats`, `doctor`, and so on): [development/commands.md](./development/commands.md).

## PWA install and secure context

Streaming works from a normal browser tab on your LAN. **Install app** and the offline shell need a **secure context**:

- `https://…`, or
- `http://localhost` / `http://127.0.0.1` (optionally with a port)

Plain `http://192.168.x.x` is fine for tab streaming; it is **not** installable. Set `MUSICWEB_PUBLIC_ORIGIN` to the origin clients actually open when you care about install identity. See [development/environment.md](./development/environment.md) and [systems/pwa.md](./systems/pwa.md).

## Next links

| Topic | Doc |
|-------|-----|
| Install, run, library CLI | [development/commands.md](./development/commands.md) |
| Environment and config | [development/environment.md](./development/environment.md) |
| Get started: exclusive audio (macOS / Windows, optional) | [systems/exclusive-audio.md](./systems/exclusive-audio.md#get-started) |
| Full documentation map | [README.md](./README.md) (this `docs/` tree) |
