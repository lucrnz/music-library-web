# Stage 01: Backend test harness

## Status
done

## Description

Add a shared tmp-data-dir + migrated SQLite fixture and a smoke test that `init_database` creates `tracks` and `tracks_fts`. Leave every existing `tests/test_*.py` file where it is.

## Rationale

Identity, finalize, jobs, and FTS tests need one production-shaped tmp DB. Relocating the 16 existing modules does not delete a layer and breaks `tests/test_diag_media.py` (`parents[1]` is the repo root).

## Invariants

- `uv run --group dev pytest` still collects every existing test and they all pass with the same assertions and the same paths.
- Tests never open the developer `.env` library path or `data/library.db`.
- Schema comes from Alembic (`init_database`), not `create_all`.
- Do not add `pytest-cov`, `httpx`, or `create_app`.
- Do not `git mv` existing test modules. Do not edit `tests/test_format_policy.py`.

## Risks

- pydantic-settings may still read process env / `.env` and point `Settings()` at the real library. The fixture must force both paths.

## Implementation

### Files

- Create: `tests/conftest.py`
- Create: `tests/db/test_engine_fixture.py`
- Do not change `pyproject.toml` (`testpaths = ["tests"]` already recurses)
- Do not move or edit existing `tests/test_*.py`

### Steps

1. Add `tests/conftest.py` with:
   - `tmp_home(tmp_path, monkeypatch)` — `lib = tmp_path / "library"`, `data = tmp_path / "data"`, both `mkdir`. `monkeypatch.setenv("MUSIC_LIBRARY_PATH", str(lib))` and `monkeypatch.setenv("MUSICWEB_DATA_DIR", str(data))`. Construct `Settings(music_library_path=lib, musicweb_data_dir=data, _env_file=None)` so a leftover project `.env` cannot win. Yield a small namespace `{root: tmp_path, lib, data, settings}`. Function-scoped, not session-scoped.
   - `db(tmp_home)` — `init_database(tmp_home.data)` (default `migrate=True`), yield the `Database`, call `dispose()` in teardown.
2. Add `tests/db/test_engine_fixture.py` that uses `db` and asserts `inspect(engine).has_table("tracks")` and `has_table("tracks_fts")`, and that `ScanState` id=1 exists and is `idle`.

### Verify

```sh
uv run --group dev pytest
```

- All pre-existing tests pass from their current paths.
- The new fixture smoke passes.

## Acceptance

- [ ] All pre-existing tests still pass at `tests/test_*.py`.
- [ ] `init_database` fixture yields a migrated tmp DB with FTS and does not touch `./data/library.db`.
- [ ] No existing test file was moved or edited.
- [ ] No coverage package added to `pyproject.toml`.
