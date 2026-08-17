**Archive.** Decisions in this file were current as of 2026-08-16 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Unit test coverage for meaningful components

## Goal

Give every meaningful / heavy-logic unit on the server and in the SPA an automated test, without a coverage-percentage gate. Backend first. Tests stay fast and hermetic: unit-first, tmp SQLite via the production migrate path, never `create_app`, never ffmpeg encode, never a real network.

## Settled decisions

- **Surfaces.** Both pytest and Vitest. Implement backend stages before frontend stages.
- **Success.** Inventory-driven: a module is done when the behaviors listed in [coverage-inventory.md](./coverage-inventory.md) have tests. No `pytest-cov`, no Vitest coverage reporter, no `fail-under`, no CI.
- **Kind.** Pure unit tests for policy / parse / identity helpers. Thin in-process integration only where the bug lives in SQLite wiring (identity, batch, finalize, job runner). Existing synthetic-Request diag/media tests stay where they are; this plan does not add another media 404 or exclusive-tag handler suite.
- **Never boot.** Do not call `create_app`. Do not add `httpx` / TestClient. Do not encode with ffmpeg. Do not talk to Last.fm, MusicBrainz, fanart.tv, or LRCLIB. Do not exercise Core Audio / mpv. Do not open the developer’s real library or `data/` directory.
- **Backend include.** Fingerprint, identity/reattach, walk, batch, finalize, job runner, library path jail, lyrics parse, artist-image pick, transcode probe (I/O mocked), `db.names` / FTS helpers, and serializers. Existing format / sibling / profile / passthrough / idle / diag / exclusive-hub tests stay in `tests/test_*.py` and are not rewritten or relocated.
- **Frontend include.** Pure policy modules plus playlist queue/repeat/shuffle and settings codec/policy. Keep the Icon Chromium smoke. Skip Vue chrome, OPFS/IDB/worker, companion WebSocket, playback sinks, `player.ts` loaders, and PWA registration.
- **Frontend runner.** Dual Vitest projects: `node` for new TS/store tests, existing Playwright Chromium project for `tests/browser/**`. In-memory `localStorage` / `sessionStorage` stub in a node setup file. No happy-dom / jsdom.
- **Layout.** New pytest files live under `tests/<package>/` (`testpaths = ["tests"]` already recurses). Leave the 16 existing `tests/test_*.py` files in place — relocating them does not delete a layer and breaks `tests/test_diag_media.py` (`parents[1]` → repo root). Nest new frontend tests under `frontend/tests/{area}/`; move only the Icon smoke into `frontend/tests/browser/`.
- **SQLite.** `init_database(tmp_path)` / Alembic to head (including FTS). One shared `tests/conftest.py` fixture. Not `create_all`, not a committed fixture DB.
- **Seams.** Tiny only: export an already-pure helper, inject a clock/path. No behavior refactors, no new DI frameworks. Production code otherwise changes only to fix bugs tests find.
- **Audio fixtures.** No committed audio binaries. SHA-256 tests use tmp bytes. The FLAC STREAMINFO branch mocks `mutagen.flac.FLAC`.
- **Docs.** Final stage adds `docs/development/testing.md` and points `commands.md`, `project-structure.md`, `docs/README.md`, and `AGENTS.md` at it. This plan directory is not the ADR.
- **CI.** Out of scope. Local commands stay `uv run --group dev pytest` and `pnpm --dir frontend test`.

## Design

Today the suite is a narrow slice: 16 pytest modules (formats, lossy siblings, transcode profiles/passthrough/idle, diag, exclusive hub) and one Vitest browser Icon smoke. There is no `conftest.py`, no coverage tooling, no CI, and no `docs/development/testing.md`. The heavy correctness paths — content fingerprints, path-stable reattach, mark-missing, single-flight jobs, client quality/play-block/download policy — have no tests.

The plan adds a **harness**, then fills the inventory, then writes the testing convention.

**Backend harness.** New tests go in package-shaped subdirectories. A function-scoped fixture creates a tmp data dir, points `MUSIC_LIBRARY_PATH` / `MUSICWEB_DATA_DIR` at it (so `.env` cannot leak the developer’s library), and returns `init_database(data_dir)`. It does not leak the developer DB. Tests that only need files use `tmp_path` as today.

**Frontend harness.** Vitest `test.projects` splits node vs browser. Node tests import `@/` the same way the app does. A setup file installs a Map-backed `localStorage` so playlist/settings persist/hydrate can run without a DOM.

**How a “meaningful” test looks.**

| Kind | Example | Collaborators |
|---|---|---|
| Pure function | `album_lossy_kind`, `fts_query_string`, `qualityRank`, `parseLrc` | none |
| Filesystem unit | `Library.resolve` jail, `iter_indexable_audio` | `tmp_path` empty files by suffix |
| SQLite unit | `resolve_track` reattach, `mark_missing`, `fts_upsert` | `init_database` fixture |
| Isolated runner | `LibraryJobRunner.start` returns False when busy | tmp DB + mocked `_execute` |
| Serializer unit | missing path is null; instrumental lyrics strip text | in-memory ORM objects, no HTTP |
| Store unit | `pl.nextIndex` under repeat=all; `getActiveStreamCodec` | localStorage stub; mock `networkConstraints` |

**Seams already implied by the inventory.** Export `computeNextIndex` from `playlist.ts` (it is already documented as a pure function). Extract `assembleDownloadsHierarchy(tracks, albums, artists)` from `buildDownloadsHierarchy` so the tree/sort logic is testable without IndexedDB. Mock `mutagen.flac.FLAC` and `subprocess.run` (ffprobe) rather than shipping fixtures.

Include / exclude tables: [coverage-inventory.md](./coverage-inventory.md).

## Stage map

Harness first, then dependency order through the scan core, then leftover backend policy, then frontend (policy → downloads → stores), then living docs.

1. **Backend harness** must land before any new SQLite test. Fixture + smoke only; existing `tests/test_*.py` stay put.
2. **Frontend harness** is independent of 01 but must land before any new Vitest file (node project + setup stub + include paths). Numbered after 01 because backend goes first.
3. **Backend pures** (`library`, `names`, FTS query string, lyrics parse, artist pick, serializers) need the harness only for FTS upsert/search. They do not depend on fingerprint/identity.
4. **Fingerprint + walk** are file/pure units that identity/batch assume. No SQLite required, but they sit before 05 so reattach tests can use real `track_id_for` / algo constants.
5. **Identity + batch + finalize** is the scan heart. It needs 01 (DB) and 04 (fingerprint contract). Highest backend impact.
6. **Job runner** needs 01 and a stable ScanState schema. It patches `_execute` rather than re-testing 05.
7. **Transcode probe** is independent of 06. Missing-track 404 and exclusive-only tags are already locked; this stage does not add handler tests.
8. **Frontend policy units** need 02 only.
9. **Downloads policy** needs 02 and the quality/play-block modules 08 will already have covered as imports. Hierarchy seam is local to this stage.
10. **Store units** need 02 (localStorage stub) and the tiny playlist export. Independent of 09 except shared setup.
11. **Living docs** last, so commands and `testing.md` describe the tree and runner split that actually shipped.

## Out of scope

- Coverage reporters, thresholds, and HTML/XML coverage artifacts
- GitHub Actions or any other CI
- `create_app`, `httpx`, TestClient, booting uvicorn
- ffmpeg encode / `transcode.worker` encode loop / `transcode.deps` capability gate
- Real mutagen FLAC files or committed audio binaries
- Network fetch (lyrics, artist images, HTTP client)
- Cover / image WebP render I/O, `pwa_shell`, service worker
- CLI except the existing logs tests
- Control UDS, runtime flock, `main.py` lifespan
- Exclusive `coreaudio.py` / `mpv_player.py` / companion `app.py`
- Vue SFC tests beyond the existing Icon smoke
- `player.ts` loaders, HTMLAudio / companion sinks, OPFS, IndexedDB, download worker
- happy-dom, jsdom, `@vue/test-utils`, Playwright as a standalone E2E suite
- Changing product behavior except bugfixes proven by a new test

## Assumptions

- Alembic `upgrade head` on an empty tmp SQLite is fast enough for the identity/jobs stages (seconds, not minutes).
- `Settings(..., _env_file=None)` plus monkeypatched `MUSIC_LIBRARY_PATH` / `MUSICWEB_DATA_DIR` isolates tests from the developer `.env`.
- Vitest 4 `test.projects` with `extends: true` inherits the Vite `@/` alias and Vue plugin for both projects.
- Node `localStorage` can be a small in-memory stub; playlist and settings only need `getItem` / `setItem` / `removeItem` / `clear`.
- `pnpm --dir frontend test` remains the single frontend command and runs both Vitest projects.
- New `tests/<package>/` files do not require `__init__.py`.
- Existing `tests/test_*.py` keep passing unchanged; `test_diag_media.py` continues to resolve `worker.py` via `Path(__file__).resolve().parents[1]`.
