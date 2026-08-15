# Stage 06: `musicweb logs` CLI

## Status
done

## Description

Add a Typer group `musicweb logs` with `list`, `show`, `tail`, and `purge` that read and delete JSONL under `Settings.diag_dir` without taking the data-dir lock or talking to the control socket.

## Rationale

The operator will diagnose on the server machine. Settings only shows ids; this is how those ids become a timeline.

## Invariants

- Read-only commands never take `musicweb.lock` and never migrate.
- `purge` does not take the lock either (files are independent of the index). It must refuse to follow a `diag` path that is a symlink escape outside `musicweb_data_dir` (resolve and check prefix).
- Default `show`/`tail` print one JSON object per line (raw JSONL), oldest-first for `show`, last N for `tail`.
- Filters: `--client`, `--session`, `--play`, `--source` (`client`|`server`), `--event` (exact name), `--level` (`info`|`warn`|`error`), `--day YYYY-MM-DD`. Combine with AND.
- `list` prints days, byte size, line count, distinct `client_id` / `session_id` values (nulls ignored).

## Risks

- A 64MB file `show` without filters can flood the terminal. Default `show` without `--day` still scans all files; document that `--day` / `--session` (Everything repro) or `--level error` (quiet failures) is the usual path. No pager required.
- `tail --follow` must handle rotation (new day file, deleted old file) without spinning at 100% CPU (sleep ≥200ms).

## Implementation

### Files

- Create `src/musicweb/cli/logs.py`
- Change `src/musicweb/cli/app.py` (`app.add_typer`)
- Create `tests/test_diag_cli.py`

### Steps

1. Typer group `logs` with commands:
   - `list`
   - `show` with the filters above
   - `tail` with the same filters plus `--follow` / `-f` and `--lines` default 50
   - `purge --older-than DAYS` and `--all` (require one); `--yes` to skip confirm. Without `--yes`, Typer confirm.
2. Load settings via the same env path other CLI commands use; do **not** call `bootstrap_services` unless already required for settings-only. Prefer `load_settings()` + `diag_dir`.
3. Parse lines defensively: skip corrupt JSON with a count on stderr, do not abort the whole `show`.
4. Tests write a temp dir of JSONL, monkeypatch `diag_dir` / settings, invoke Typer (`CliRunner`) for `list`/`show`/`purge`.

### Verify

- `uv run --group dev pytest tests/test_diag_cli.py`
- `uv run musicweb logs --help` and `uv run musicweb logs show --help`
- `rg "bootstrap_services|musicweb.lock|control" src/musicweb/cli/logs.py` — no lock/control usage
- Fixture: two days, two `client_id`s; `show --client A --event player.load.fail` and `show --level error` print only matching lines.

## Acceptance

- [x] `musicweb logs list` reports each `events-*.jsonl` with counts.
- [x] `show` AND-filters work; bad lines are skipped.
- [x] `purge --older-than 0 --yes` deletes previous-day files and leaves today (define older-than as mtime or filename date — **filename UTC date**, not mtime).
- [x] `purge --all --yes` deletes all `events-*.jsonl` only.
- [x] Server can stay running; CLI still reads.
