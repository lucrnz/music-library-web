# Stage 01: CLI companion command

## Status
done

## Description

Replace `musicweb exclusive-audio` with `musicweb companion`. Move the Typer module, require `COMPANION_TOKEN`, rename `ExclusiveHub`’s secret parameter, and make help / banner / FastAPI title say Desktop companion / `musicweb companion`.

## Rationale

Later stages document and type a command that must already exist. The hub constructor and env name are the operator contract the client will match.

## Invariants

- `uv run musicweb companion --help` succeeds. `exclusive-audio` is unknown (non-zero, not aliased).
- Empty or missing `COMPANION_TOKEN` exits 1 before bind. `HOG_TOKEN` is not read.
- Companion still `load_env_file()` then `os.environ`; no data-dir lock; not a `Settings` field.
- Flags stay `--port` and `--mpv`. Bind stays `127.0.0.1` with `ws="websockets-sansio"`.
- WebSocket hello field stays `token`. `PROTOCOL_VERSION` stays `1`.
- Core Audio hog language in warnings and exclusive-package behavior stays.

## Risks

- Anyone still exporting `HOG_TOKEN` will get the missing-token exit until they rename the env key. Accepted (hard cut).

## Implementation

### Files

- `src/musicweb/cli/companion.py`
- `src/musicweb/cli/exclusive_audio.py`
- `src/musicweb/cli/app.py`
- `src/musicweb/exclusive/session.py`
- `src/musicweb/exclusive/app.py`
- `src/musicweb/exclusive/__init__.py`
- `src/musicweb/exclusive/protocol.py`
- `tests/cli/test_companion_cli.py`
- `tests/test_exclusive_hub_release.py`

### Steps

1. Add `src/musicweb/cli/companion.py` from `src/musicweb/cli/exclusive_audio.py`: functions `run_companion` and `companion`. Typer help: Desktop companion (macOS), exclusive audio via mpv hog + loopback WebSocket. Read `COMPANION_TOKEN` (strip; required). Error and banner text name `COMPANION_TOKEN` and Settings → Exclusive audio. Banner first line: `musicweb companion  protocol v…`. Pass `companion_token=` into the hub.
2. Delete `src/musicweb/cli/exclusive_audio.py`.
3. In `src/musicweb/cli/app.py`, import `musicweb.cli.companion` and register `app.command("companion")`. Remove the `exclusive-audio` registration and `exclusive_audio` import.
4. In `src/musicweb/exclusive/session.py`, rename `hog_token` constructor kwarg and attribute to `companion_token`. Compare hello `token` to `self.companion_token`.
5. In `src/musicweb/exclusive/app.py`, set FastAPI `title="musicweb companion"` and retitle the module docstring to Desktop companion. In `src/musicweb/exclusive/__init__.py` and `src/musicweb/exclusive/protocol.py`, replace “exclusive-audio companion” process wording with Desktop companion; keep exclusive-audio as the feature the protocol serves.
6. Add `tests/cli/test_companion_cli.py` using `typer.testing.CliRunner` on `musicweb.cli.app.app`: `companion --help` exit 0 and mentions Desktop companion; `exclusive-audio` is unknown; invoking `companion` with `COMPANION_TOKEN` unset exits 1 and mentions `COMPANION_TOKEN` (does not bind).
7. In `tests/test_exclusive_hub_release.py`, construct `ExclusiveHub(companion_token="test-token")`.

### Verify

```sh
uv run --group dev pytest tests/cli/test_companion_cli.py tests/test_exclusive_hub_release.py
uv run musicweb companion --help
uv run musicweb exclusive-audio --help
```

`--help` for `companion` names Desktop companion and `--port` / `--mpv`. `exclusive-audio` is not a command. Do not start uvicorn in pytest.

## Acceptance

- `uv run musicweb companion --help` documents Desktop companion.
- `musicweb exclusive-audio` is gone.
- Missing `COMPANION_TOKEN` exits 1 with instructions; `HOG_TOKEN` alone is not enough.
- Hub tests pass with `companion_token`.
- No frontend or living-docs edits in this stage.
