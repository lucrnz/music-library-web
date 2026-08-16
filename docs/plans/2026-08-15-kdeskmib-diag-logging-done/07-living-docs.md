# Stage 07: Living docs

## Status
done

## Description

Record the diagnostic system in living docs: a systems page, commands, data-dir layout, ownership, and map links. Do not copy the event catalog or JSON envelope into those pages.

## Rationale

`design.md` is not living documentation. Operators and later agents need to know where events go, that Errors only vs Everything is a transmit cutoff (not an off switch), and that failure lines always flow.

## Invariants

- Exact event names, header names, and payload keys stay in source (`musicweb/diag/`, `static/js/diag/`, `cli/logs.py`).
- Docs state intent, ownership, and guardrails (Errors only / Everything cutoff, JSONL not SQLite, no ingest auth, no library paths in `data`, cookies not query params on stream URLs).
- No new env var, so `.env.example` is unchanged.

## Risks

- A systems page that pastes the catalog will rot the first time a name changes. Keep the catalog out.

## Implementation

### Files

- Create `docs/systems/diagnostics.md`
- Change `docs/README.md` (systems list)
- Change `docs/development/commands.md` (CLI table + short `logs` section)
- Change `docs/development/environment.md` (data-dir tree includes `diag/`)
- Change `docs/development/project-structure.md` (`diag/` package + `static/js/diag/` + `cli/logs.py`)
- Change `docs/frontend/conventions.md` (one bullet: client diag module, Diagnostics dropdown)
- Change `docs/architecture/index.md` (optional one-line box on the overview list — only if the existing numbered list is the right place)
- Change `AGENTS.md` (deep-dive link)

### Steps

1. Write `docs/systems/diagnostics.md` with: purpose, Errors only vs Everything (default quiet, Everything mints a session), levels as a cutoff not a second instrumentation path, JSONL location + rotation intent, join-key + mode cookies/headers (stable stream URL), client outbox, CLI as the reader, source-of-truth paths, guardrails (no SQLite, no ingest log recursion, no library paths, LAN trust).
2. Add `musicweb logs …` to the commands table; point at Typer `--help` for flags.
3. Extend the data-dir listing with `diag/events-YYYY-MM-DD.jsonl`.
4. Ownership: `musicweb/diag` writes; `routes/diag.py` ingest; `static/js/diag/` client; `cli/logs.py` read/purge.
5. Link the new page from `docs/README.md` and `AGENTS.md` deep dives.

### Verify

- `rg "player.load.begin|X-Musicweb-Client|musicweb_play" docs/systems/diagnostics.md docs/development docs/frontend docs/architecture AGENTS.md` — no exact contract strings
- `rg "diagnostics.md" docs/README.md AGENTS.md`
- `rg "diag/" docs/development/environment.md docs/development/project-structure.md`
- Confirm `.env.example` diff is empty

## Acceptance

- [x] A new operator knows Errors only already captures playback failures, Everything is the full timeline + session id, and `musicweb logs show --session …` / `--level error` are the read paths — without reading this plan directory.
- [x] Living docs do not duplicate the event catalog.
- [x] `design.md` is not linked as if it were current after the plan is marked done (no extra archive pass required in this stage beyond the usual pending→done rename later).
