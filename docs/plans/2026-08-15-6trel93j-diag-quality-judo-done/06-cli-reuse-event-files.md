# Stage 06: CLI reuses event_files

## Status
done

## Description

Delete the CLI’s copy of the `events-YYYY-MM-DD.jsonl` walker. Import `event_files` from `musicweb.diag.store`. Keep filter/print/purge behavior. Do not rewrite `tail --follow` into a new watcher.

## Rationale

Stage 01 made the listing canonical. A second regex in `cli/logs.py` will drift the first time the filename changes.

## Invariants

- No `bootstrap_services`, no data-dir lock, no control socket.
- `purge --older-than` still uses **filename UTC date**, not mtime.
- `show` still skips corrupt lines and counts them on stderr.

## Risks

- `event_files` returns all days; CLI `--day` filter stays in the CLI (or add an optional `day=` to `event_files` in stage 01 — if stage 01 did not, filter here by name).

## Implementation

### Files

- Change `src/musicweb/cli/logs.py`
- Change `tests/test_diag_cli.py` only if imports break

### Steps

1. `from musicweb.diag.store import event_files`.
2. Delete `_EVENTS` walker duplication if `event_files` is sufficient. Keep a small date parse for purge cutoff (`events-YYYY-MM-DD` from `path.name`) — a one-line regex or `event_files` returning paths is enough.
3. `_event_files(directory, day=)` becomes a thin filter over `event_files(directory)`.
4. Do not add lock/bootstrap imports.

### Verify

- `uv run --group dev pytest tests/test_diag_cli.py tests/test_diag_store.py`
- `rg "events-\\\\(\\\\d" src/musicweb/cli/logs.py` — at most purge date parse, not a second directory walk implementation.
- `rg "bootstrap_services|musicweb.lock|control" src/musicweb/cli/logs.py` — no matches.
- `uv run musicweb logs list --help` still works.

## Acceptance

- [ ] CLI lists files only via `store.event_files`.
- [ ] Existing list/show/purge tests pass.
- [ ] Follow/tail behavior unchanged (no new watcher).
