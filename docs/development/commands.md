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
pnpm --dir frontend install
```

Requires Python 3.11+ and [uv](https://github.com/astral-sh/uv), plus **Node 20+** and [pnpm](https://pnpm.io/) for the SPA. System dependency: `ffmpeg` and **ffprobe** on `PATH`, ffmpeg built with **libsoxr**, **libopus**, and **flac**. The server and `musicweb doctor` refuse to start if those tools or encoders/resampler are missing.

Chromium for `pnpm --dir frontend test` is a one-time install (not committed):

```sh
pnpm --dir frontend exec playwright install chromium
```

## Test

Pytest lives in the `dev` dependency group (not runtime deps). Group name and tool config: `pyproject.toml`. The suite lives under `tests/` (existing `test_*.py` plus `tests/<package>/`). Frontend typecheck is `vue-tsc`. `pnpm --dir frontend test` is Vitest: node units plus Chromium Icon smoke. See `docs/development/testing.md`. `pnpm --dir frontend build` runs `vue-tsc --noEmit` on the app tsconfig, then Vite.

```sh
uv sync --group dev
uv run --group dev pytest
pnpm --dir frontend typecheck
pnpm --dir frontend test
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

Build the SPA before the first start (and after frontend changes). Missing `frontend/dist/index.html` fails `create_app` and `musicweb doctor`:

```sh
pnpm --dir frontend build
uv run musicweb
```

Dev loop (HMR on `:5173`, API on `:8765`):

```sh
uv run musicweb
pnpm --dir frontend dev
# open http://localhost:5173/
```

On start the process:

1. Validates the library path and data directory.
2. Checks ffmpeg tool capabilities.
3. Requires a built SPA at `frontend/dist/index.html`.
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
| `musicweb doctor` | Hard checks (library path, data dir, ffmpeg, DB, frontend dist, lock info) |
| `musicweb logs list` | Diagnostic event files (sizes, line counts) |
| `musicweb logs show` | Print matching JSONL (`--session`, `--level`, `--client`, …) |
| `musicweb logs tail` | Last N matching lines; `--follow` |
| `musicweb logs purge` | Delete old or all event files (`--older-than` / `--all`) |
| `musicweb radio status` | Live station face, current track, tuners, counts (debug) |
| `musicweb radio skip` | Advance now; does not add current to skip-ids |
| `musicweb radio play TRACK_ID` | Inject an eligible track as current |
| `musicweb radio pick` | Keep current; replace unplayed remainder |
| `musicweb radio reset` | Wipe queue, banlist, and skip-ids; pick a fresh batch |
| `musicweb radio banlist` | Banlist batch sizes (ids only with `--spoilers`) |
| `musicweb radio skip-ids` | List process-lifetime unplayable ids |
| `musicweb radio skip-ids clear` | Empty that unplayable set |

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

## Radio (debug)

Debug DJ tools against a **live** `musicweb` process via the Unix control socket. There is no offline persist dump. Upcoming and banlist ids stay hidden unless you pass `--spoilers`. This is not an HTTP/WebSocket DJ.

```sh
uv run musicweb radio status
uv run musicweb radio skip
uv run musicweb radio play <track-id>
```

Exact flags: `uv run musicweb radio --help`.

## Desktop companion (macOS)

Desktop companion: loopback sidecar for **hog / exclusive** Core Audio playback via **mpv**. This is **not** the library server: it does **not** take `musicweb.lock`, open the DB, or migrate.

Requires:

- `COMPANION_TOKEN` (non-empty) — from project `.env` (loaded like the server) or the process environment; paste the same value into Mac PWA → Settings → Exclusive audio
- `mpv` on `PATH` (or `--mpv /path/to/mpv`)
- macOS for real exclusive/hog device behavior

```sh
# Prefer COMPANION_TOKEN in .env (see .env.example), then:
uv run musicweb companion
# optional: --port 18765 (default)  --mpv /opt/homebrew/bin/mpv
# or one-shot: COMPANION_TOKEN=… uv run musicweb companion
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

## First-run frontend

`uv run musicweb` and a green `musicweb doctor` require `pnpm --dir frontend build` first. Missing `frontend/dist/index.html` is a fail (message names that command). After the dist exists, the server can start offline.
