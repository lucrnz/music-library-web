# Commands

Commands are documented because they are essential onboarding surface area.

## Source of truth

- Console entrypoints and dependencies: `pyproject.toml`
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

## Run

```sh
uv run musicweb
```

Or:

```sh
uv run python -m musicweb
```

On start the process:

1. Validates the library path and data directory.
2. Checks ffmpeg tool capabilities.
3. Ensures Vue/Router vendor assets under `static/vendor/` (network only when the local manifest is stale).
4. Applies Alembic migrations to head (or stamps a pre-Alembic DB).
5. Starts a non-blocking **quick** library scan.
6. Prints listen address, LAN URL (when bound to all interfaces), and tool lines.

Press **Ctrl+C** for a clean shutdown. Process-temp stream caches are deleted on exit.

## Database migrations (optional CLI)

Startup migrates automatically. For manual use from the project root:

```sh
alembic upgrade head
```

`alembic.ini` points `script_location` at `src/musicweb/db/migrations` and uses `sqlite:///./data/library.db` by default. Prefer the running app’s data dir settings for production-like paths.

## First-run network

The first start (or after a vendor version bump in `vendor_deps.py`) needs network access to download pinned Vue/Router builds from unpkg. After the local manifest matches, the server can start offline.
