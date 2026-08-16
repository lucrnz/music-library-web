# Stage 02: Pytest config and package-import smoke test

## Status
done

## Description

Add a top-level `tests/` tree, minimal pytest configuration for this src-layout package, and a smoke test that imports `musicweb` so a green `uv run pytest` proves both discovery and editable install work.

## Rationale

A trivial always-pass test only proves the runner starts. Importing the application package catches the common first failure mode (wrong install layout / missing package on `sys.path`) without standing up FastAPI, SQLite, or ffmpeg. Config belongs with the smoke test so the first suite run is intentional, not accidental defaults.

## Implementation

1. Add minimal pytest options in `pyproject.toml` (prefer this over a separate `pytest.ini` to keep tool config centralized):

   ```toml
   [tool.pytest.ini_options]
   testpaths = ["tests"]
   python_files = ["test_*.py"]
   python_functions = ["test_*"]
   ```

   Do **not** hard-code `pythonpath = ["src"]` unless `uv run` fails to import the installed package. With this project’s build backend and `uv sync`, the editable install should already expose `musicweb`.

2. Create the test layout:

   - `tests/` (top-level, next to `src/`)
   - `tests/__init__.py` only if needed for imports; for a flat smoke suite it is optional—follow whatever keeps pytest discovery clean
   - `tests/test_smoke.py` (or `tests/test_pytest_smoke.py`)

3. Smoke test content (package import sanity):

   ```python
   def test_musicweb_package_importable():
       import musicweb

       assert musicweb is not None
   ```

   Optional small strengthening without becoming an app test: assert a stable public attribute or `__name__ == "musicweb"`. Avoid FastAPI `TestClient`, DB, config env, or CLI invocation in this stage.

4. Run and confirm green:

   ```sh
   uv run --group dev pytest
   ```

   Expect one passed test, exit 0. If import fails, fix packaging/install (sync with `--group dev`, confirm `[build-system]` / package layout) rather than papering over with `sys.path` hacks in the test.
