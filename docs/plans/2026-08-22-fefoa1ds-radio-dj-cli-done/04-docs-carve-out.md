# Stage 04: Document the debug CLI carve-out

## Status
done

## Description

Write the durable operator and radio-guardrail docs for `musicweb radio`. This is the living record that the debug CLI may print upcoming ids with `--spoilers`, and that HTTP/WebSocket Remote DJ is still out of scope.

## Rationale

`context/design.md` is not living documentation. Without this stage, `radio.md` still forbids every upcoming printer and lists Remote DJ as entirely out of scope, which would contradict the new CLI.

## Invariants

- Docs describe intent and commands, not control RPC method names or exact result keys.
- HTTP, WebSocket, UI, and diagnostic logs still must never show or print next songs.
- `--spoilers` is named as the only allowed upcoming/banlist printer, and only on this CLI.

## Risks

None

## Implementation

### Files

- `docs/development/commands.md`
- `docs/systems/radio.md`
- `docs/development/project-structure.md`

### Steps

1. In `docs/development/commands.md`, add a short “Radio (debug)” section next to the other CLI groups: live server required, Unix control socket, debug-only, `--spoilers` hides upcoming/banlist ids by default. Add the verbs to the command table (`status`, `skip`, `play`, `pick`, `reset`, `banlist`, `skip-ids`, `skip-ids clear`). Point exact flags at `uv run musicweb radio --help`.
2. In `docs/systems/radio.md`, keep “Remote DJ (skip, request, seek, operator queue view)” out of scope for HTTP/WebSocket/UI. Add a debug-CLI paragraph: local `musicweb radio` on the control socket may skip/play/pick/reset and, with `--spoilers` only, print upcoming and banlist ids. Record that skip/play/reset push the existing now-playing snapshot so tuned clients follow; no new WS types. Update Guardrails so “do not log or serialize upcoming ids” still applies to HTTP, WS, UI, and logs, with this CLI+`--spoilers` exception.
3. In `docs/development/project-structure.md`, add `radio` to the `cli/` ownership line and extend `control/` from “health + job RPC” to include live radio debug RPC.

### Verify

Read the three files and confirm they match the settled decisions in [context/design.md](context/design.md) and the argv surface in `src/musicweb/cli/radio.py` (help text vs documented verbs). No code tests.

## Acceptance

- `docs/development/commands.md` documents `musicweb radio` as live-server debug CLI with `--spoilers`.
- `docs/systems/radio.md` carves that CLI out of Remote DJ / upcoming-id rules without adding an HTTP DJ.
- `docs/development/project-structure.md` ownership lines mention the radio CLI and control radio RPC.
