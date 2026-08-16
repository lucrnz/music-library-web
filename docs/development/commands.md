# Commands

Commands are documented because they are essential onboarding surface area.

## Source of truth

- Console entrypoints and dependencies: `pyproject.toml`
- CLI implementation: `src/musicweb/cli/`
- Env names and defaults: `.env.example`, `src/musicweb/config.py`
- Alembic CLI config: `alembic.ini` (runtime migrate also in `src/musicweb/db/engine.py`)

Verify scripts and flags against those files when something looks wrong; this page is a convenience copy.

## Install

```sh
cp .env.example .env
# Edit .env — set MUSIC_LIBRARY_PATH to your library root
uv sync
```

Requires Python 3.11+ and [uv](https://github.com/astral-sh/uv). System dependency: `ffmpeg` on `PATH` built with **libsoxr**, **libopus**, and **flac**. The server refuses to start if those encoders/resampler are missing.

## Test

Pytest lives in the `dev` dependency group (not runtime deps). Group name and tool config: `pyproject.toml`.

```sh
uv sync --group dev
uv run --group dev pytest
```

## Run (HTTP server)

```sh
uv run musicweb
# or
uv run musicweb serve
```

Or:

```sh
uv run python -m musicweb
```

Bare `musicweb` and `musicweb serve` are the same. The process takes an **exclusive flock** on `$MUSICWEB_DATA_DIR/musicweb.lock` so only one server (or local write job) owns the data dir.

On start the process:

1. Validates the library path and data directory.
2. Checks ffmpeg tool capabilities.
3. Ensures Vue/Router vendor assets under `static/vendor/` (network only when the local manifest is stale).
4. Applies Alembic migrations to head (or stamps a pre-Alembic DB).
5. Starts the private control Unix socket (`$MUSICWEB_DATA_DIR/musicweb.sock`).
6. Starts a non-blocking **quick** library scan.
7. Prints listen address, LAN URL (when bound to all interfaces), and tool lines.

Press **Ctrl+C** for a clean shutdown. Process-temp stream caches are deleted on exit and also emptied after about an hour with no HTTP client; the control socket is unlinked.

## Library CLI

Write jobs use the same multi-kind job runner as HTTP (`musicweb.jobs`). If the server is up and the control socket answers, jobs run **inside the server** and the CLI polls status. If no server, the CLI takes the exclusive data-dir lock and runs locally (migrating only when no server holds the lock).

| Command | Role |
|---------|------|
| `musicweb scan [--mode quick\|full]` | Library scan (default `quick`) |
| `musicweb scan status` | Job/scan status JSON (read-only; OK while server runs) |
| `musicweb scan cancel` | Cancel in-flight job on a live server |
| `musicweb regen-covers [--force]` | Cover extract from index paths |
| `musicweb regen-artist-images [--force]` | Artist portraits |
| `musicweb regen-lyrics [--force]` | Lyrics fetch |
| `musicweb stats` | Counts (artists/albums/tracks/missing) |
| `musicweb doctor` | Hard checks (library path, data dir, ffmpeg, DB, lock info) |
| `musicweb logs list` | Diagnostic event files (sizes, line counts) |
| `musicweb logs show` | Print matching JSONL (`--session`, `--level`, `--client`, …) |
| `musicweb logs tail` | Last N matching lines; `--follow` |
| `musicweb logs purge` | Delete old or all event files (`--older-than` / `--all`) |

`--force` redoes work that would otherwise skip (covers already present, artist cooldown/images, lyrics cooldown). Full scan (`--mode full`) also forces covers, artist images, and lyrics enrichment.

Ctrl+C cancels a **local** foreground job cooperatively. Cross-process cancel is `scan cancel` against a live server.

## Diagnostic logs

JSONL under `$MUSICWEB_DATA_DIR/diag/` (see `docs/systems/diagnostics.md`). The CLI reads and purges files only — no data-dir lock, no control socket, safe while the server runs.

```sh
uv run musicweb logs list
uv run musicweb logs show --level error
uv run musicweb logs show --session <id>
uv run musicweb logs purge --older-than 7 --yes
```

Exact flags: `uv run musicweb logs --help`.

## Exclusive audio companion (macOS)

Loopback companion for **hog / exclusive** Core Audio playback via **mpv**. This is **not** the library server: it does **not** take `musicweb.lock`, open the DB, or migrate.

Requires:

- `HOG_TOKEN` (non-empty) — from project `.env` (loaded like the server) or the process environment; paste the same value into Mac PWA → Settings → Exclusive audio
- `mpv` on `PATH` (or `--mpv /path/to/mpv`)
- macOS for real exclusive/hog device behavior

```sh
# Prefer HOG_TOKEN in .env (see .env.example), then:
uv run musicweb exclusive-audio
# optional: --port 18765 (default)  --mpv /opt/homebrew/bin/mpv
# or one-shot: HOG_TOKEN=… uv run musicweb exclusive-audio
```

Listens on **127.0.0.1 only**, default port **18765**, WebSocket at `ws://127.0.0.1:18765/ws`. The installed Mac PWA connects with the token; first session is controller, further tabs are read-only.

Operator get started (then design): `docs/systems/exclusive-audio.md`.

## Database migrations (optional CLI)

Serve always migrates on start. Offline CLI migrates when the data-dir lock is free. While the server holds the lock, CLI read paths open the DB **without** migrating.

Manual Alembic from the project root:

```sh
alembic upgrade head
```

`alembic.ini` points `script_location` at `src/musicweb/db/migrations` and uses `sqlite:///./data/library.db` by default. Prefer the running app’s data dir settings for production-like paths.

## First-run network

The first start (or after a vendor version bump in `vendor_deps.py`) needs network access to download pinned Vue/Router builds from unpkg. After the local manifest matches, the server can start offline.
