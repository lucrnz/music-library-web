# Stage 04: Companion app-support data dir

## Status
done

## Description

Resolve the OS default companion data directory and print it on every `musicweb companion` launch. Do not add an env override. Do not serve files yet.

## Rationale

Blob I/O and the Settings path line need a single, documented home. Printing it on launch is the operator contract.

## Invariants

- macOS: `~/Library/Application Support/musicweb-companion`
- Windows: `%LOCALAPPDATA%\musicweb-companion` (`Path.home() / "AppData" / "Local" / "musicweb-companion"` if the env is missing)
- Linux: `$XDG_DATA_HOME/musicweb-companion` or `~/.local/share/musicweb-companion`
- No `COMPANION_DATA_DIR`. No `--data-dir` flag.
- Launch banner includes the resolved path even if the directory does not exist yet.
- mpv and `COMPANION_TOKEN` checks are unchanged.

## Risks

- Creating the directory at print time can surprise a `--help` or failed-token run. Print only; mkdir in stage 05 on first blob write.

## Implementation

### Files

- `src/musicweb/exclusive/paths.py`
- `src/musicweb/cli/companion.py`
- `tests/exclusive/test_paths.py`
- `tests/cli/test_companion_cli.py`

### Steps

1. Create `src/musicweb/exclusive/paths.py` with `default_companion_data_dir(home, *, system, environ) -> Path` that implements the three OS rules. `system` is `sys.platform` (`darwin`, `win32`, else POSIX). Public `companion_data_dir()` calls that with `Path.home()`, `sys.platform`, `os.environ`.
2. In `src/musicweb/cli/companion.py`, after the token and mpv checks succeed, compute `companion_data_dir()` and include it on the existing startup banner (a `data` / `files` line next to `listening` / `health` / `mpv`). Do not mkdir.
3. Add `tests/exclusive/test_paths.py` covering darwin, win32 with `LOCALAPPDATA`, win32 without it, POSIX with `XDG_DATA_HOME`, POSIX without it.
4. In `src/musicweb/cli/companion.py`, extract `banner_lines(port, mpv_path, data_dir) -> str` and print that. In `tests/cli/test_companion_cli.py`, assert the string contains the data dir path. Do not boot uvicorn.

### Verify

```sh
uv run --group dev pytest tests/exclusive/test_paths.py tests/cli/test_companion_cli.py
```

## Acceptance

- `default_companion_data_dir` matches the three OS rules in [context/design.md](context/design.md).
- A successful companion start print includes that path.
- Missing `COMPANION_TOKEN` still exits 1 before bind and does not require the data dir to exist.
