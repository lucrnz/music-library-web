# Stage 04: Living docs

## Status
done

## Description

Replace the written rule that radio must not write listen-stat events. Document tuned-in-only client cycles, `origin`, and mixed rankings. Do not treat `context/design.md` as living documentation.

## Rationale

`docs/systems/playback-stats.md` and `docs/systems/radio.md` currently forbid radio listens. After stages 01–03 those sentences are false and will block the next change.

## Invariants

- Living docs describe the shipped client behavior. They do not add product stages 01–03 did not implement (no Stats filter, no household-once, no exclusive radio).
- Source of truth for columns, POST fields, and encoder argv stays the code.
- No ADR. The listen contract stays in `docs/systems/playback-stats.md`.
- Server package `radio/` still does not own listen stats (`docs/architecture/index.md` table stays accurate).

## Risks

- Partial edits that leave “radio must not write listens” in one file.

## Implementation

### Files

- `docs/systems/playback-stats.md`
- `docs/systems/radio.md`
- `docs/systems/playback.md`

### Steps

1. In `docs/systems/playback-stats.md` **What a listen is**: delete **Radio must not start a listen cycle**. State that radio **does** start a cycle after a successful tuned load (load + seek-to-clock + play), only while this client is `tuned`, with the same 70% / pause / seek / late-resume rules. Tune-out discards (Stop, not Pause). Each tuned-in client posts independently. Do not infer from `/api/stream`, prepare, JSONL, or the station clock. In **Where events live**: events also store `origin` (`queue` | `radio`); omitted ingest and existing rows are `queue`; rankings stay mixed and unfiltered. Point at `radio/session.ts` next to the player call sites.
2. In `docs/systems/radio.md` **Client**: replace “Radio does not write listen-stat events” with the tuned-in cycle (bridge from `session.ts` / `radio.ts`, `origin: radio`, delivery `play_source`, discard on Tune out / leave / new load). In **Out of scope**: delete the “Radio listen stats / Stats rankings for radio” bullet. Do not add a ranking UI. Guardrails: still no `player.ts` import; still do not infer listens from HTTP stream.
3. In `docs/systems/playback.md`, replace the radio sentence that says radio does not write listen-stat events with the same tuned-in rule and a pointer to `docs/systems/playback-stats.md`.
4. Grep `docs/` (exclude `docs/plans/`) for leftover “must not start a listen”, “does not write listen-stat”, and “Radio listen stats”.

### Verify

```sh
rg -n "must not start a listen|does not write listen-stat|Radio listen stats" docs --glob '!docs/plans/**'
```

Read the edited sections and confirm they match stages 01–03 (`origin`, mixed rankings, tuned-only, per-client, late join = resume). No code test run required unless a later edit accidentally touched source.

## Acceptance

- Living system docs say radio counts when this client is tuned in, with the same 70% contract and an `origin` field.
- Archived plans under `docs/plans/` may still say radio listens were out of scope; do not rewrite them.
- `docs/architecture/index.md` still lists listen stats as outside the server `radio/` package.
