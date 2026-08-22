# Stage 03: musicweb radio CLI

## Status
done

## Description

Add the `musicweb radio` Typer group: health-check the live control socket, call the stage 02 client methods, and print the human-text status described in [context/design.md](context/design.md).

## Rationale

This is the operator surface. It should be a thin formatter over the control client so socket policy and spoiler filtering stay in one place.

## Invariants

- Bare `musicweb radio` prints help and exits 0 (or Typer’s normal help exit). It does not dump station state.
- If `ControlClient.health()` is false, every verb exits 1 and prints on stderr that a live `musicweb` server is required. No SQLite fallback.
- `--spoilers` exists on `status`, `skip`, `play`, `pick`, `reset`, and `banlist` only, and is forwarded as the RPC `spoilers` param.
- The formatter never prints upcoming ids or banlist ids unless `--spoilers` was passed on that invocation.
- `skip-ids` / `skip-ids clear` do not take `--spoilers`.
- Control errors become stderr + exit 1.

## Risks

- Printing a raw `json.dumps` of the RPC result would leak spoilers whenever the server payload is too wide. Mitigation: a dedicated formatter that only emits upcoming/banlist id lines when the CLI flag is set.

## Implementation

### Files

- `src/musicweb/cli/radio.py`
- `src/musicweb/cli/app.py`
- `tests/cli/test_radio.py`
- `tests/cli/test_radio_cli.py`

### Steps

1. Add `src/musicweb/cli/radio.py` as a Typer app with `no_args_is_help=True`. Group help must say this is a debug-only live-server tool.
2. Commands, matching [context/design.md](context/design.md):
   - `status`
   - `skip`
   - `play TRACK_ID` (positional)
   - `pick`
   - `reset`
   - `banlist`
   - `skip-ids` (list)
   - `skip-ids clear`
3. Shared `--spoilers` option on the verbs listed in Invariants. Each command: `load_settings` → `ControlClient` → `health()` or exit 1 → corresponding client method → print labeled lines to stdout.
4. Implement the labeled-line layout from the Design section of [context/design.md](context/design.md) (`face:`, `track:`, `album:`, clock, tuners, counts; spoiler blocks only when flagged).
5. Register the group in `src/musicweb/cli/app.py`: `app.add_typer(..., name="radio")`.
6. Add `tests/cli/test_radio_cli.py` with `typer.testing.CliRunner` against the radio Typer app (or the root app). Monkeypatch `ControlClient` / `load_settings`. Cover: bare help; no-socket exit 1; status without `--spoilers` omits upcoming ids even if the fake client returns them; `--spoilers` prints them; `play` forwards the track id; `skip-ids` has no spoilers flag. Basename is `test_radio_cli.py` so it does not collide with `tests/control/test_radio.py`.

### Verify

```sh
uv run --group dev pytest tests/cli/test_radio_cli.py
uv run musicweb radio --help
uv run musicweb radio status --help
```

`musicweb radio --help` lists the verbs. Do not require a live server for the pytest file.

## Acceptance

- `uv run musicweb radio --help` shows `status`, `skip`, `play`, `pick`, `reset`, `banlist`, and `skip-ids`.
- A missing control socket exits 1 with a live-server message on stderr.
- Human text matches the labeled-line contract in [context/design.md](context/design.md).
- Upcoming/banlist ids appear only when `--spoilers` was passed.
- No new HTTP or frontend files. No docs in this stage.
