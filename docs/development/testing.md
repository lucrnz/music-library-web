# Testing

Automated tests cover heavy logic on the server and in the SPA. They do not replace a built SPA, a real library, or `musicweb doctor`.

## Source of truth

- Backend suite: `tests/` (`pyproject.toml` `[tool.pytest.ini_options]`)
- Shared tmp DB fixture: `tests/conftest.py` (`init_database` on a tmp data dir)
- Frontend suite: `frontend/tests/` (`frontend/vitest.config.ts`)
- Commands: this page and `docs/development/commands.md` — verify flags in `pyproject.toml` and `frontend/package.json`

## What we test

Meaningful units: scan identity/fingerprints, job single-flight, transcode probe/policy, path jail, lyrics/artist-image pickers, radio picker/clock/tuner/protocol (mocked ffprobe and `Transcoder`), client quality/play-block/download policy, playlist cursor, settings persist. Radio tests hit extracted helpers; they do not import `player.ts`.

Not Vue chrome, OPFS/IndexedDB/download worker, `player.ts` loaders, sinks, PWA registration, ffmpeg encode, or outbound fetch.

## How to run

```sh
uv sync --group dev
uv run --group dev pytest
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Chromium for the Icon smoke is a one-time machine install: `pnpm --dir frontend exec playwright install chromium`.

There is no coverage reporter and no CI gate. The suite is expected to **collect** on Windows (importlib mode; portable data-dir lock). There is no Windows CI job.

## Layout

Existing pytest modules stay at `tests/test_*.py`. New backend tests live under `tests/<package>/` (for example `tests/scan/`, `tests/jobs/`). `testpaths = ["tests"]` already recurses; no `__init__.py` is required.

Frontend tests nest by area under `frontend/tests/`. Vitest runs two projects:

- **node** — `tests/**/*.test.ts` except `tests/browser/**`, with a Map-backed `localStorage` / `sessionStorage` stub (`frontend/tests/setup-node.ts`)
- **browser** — Playwright Chromium, `tests/browser/**` (Icon smoke)

`pnpm --dir frontend test` runs both.

## SQLite in tests

Identity, batch, finalize, FTS, and job-runner tests use `init_database` on a tmp data dir (Alembic to head, including FTS). They do not call `create_all` and must not open the developer `data/library.db`. `Settings(..., _env_file=None)` plus `MUSIC_LIBRARY_PATH` / `MUSICWEB_DATA_DIR` monkeypatches isolate `.env`.

## Never boot

Tests must not:

- call `create_app` or start uvicorn (radio tests hit `now_playing.serialize` / protocol helpers, not TestClient)
- encode with ffmpeg or invoke a real `ffprobe` / `FLAC` file
- talk to Last.fm, MusicBrainz, fanart.tv, or LRCLIB
- exercise Core Audio / mpv
- open the developer library or `data/` directory

Tiny production seams only (export an already-pure helper). Do not add `httpx`, TestClient, happy-dom, jsdom, or a coverage package without a new decision.

## Guardrails

- Prefer `tmp_path` empty files by suffix over committed audio binaries.
- Patch I/O at the import site the unit uses (`musicweb.scan.fingerprint.FLAC`, `subprocess.run`).
- `LibraryJobRunner` tests patch `_execute`; they do not walk a real library.
- Frontend store tests mock `@/api`; they do not import `player.ts`.
