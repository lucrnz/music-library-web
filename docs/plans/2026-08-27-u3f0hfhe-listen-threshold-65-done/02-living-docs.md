# Stage 02: Living docs

## Status
done

## Description

Replace the written 70% listen bar in `docs/systems/playback-stats.md` with 65%. Do not treat `context/design.md` as living documentation.

## Rationale

That page owns the listen contract. After stage 01, every “70%” sentence there is false and will block the next change.

## Invariants

- Living docs describe the shipped client behavior. They do not add product stage 01 did not implement (no settings toggle, no server-side re-check, no historical recount).
- Source of truth for the numeric constant stays `LISTEN_THRESHOLD` in code.
- No ADR. The listen contract stays in `docs/systems/playback-stats.md`.
- Archived plans under `docs/plans/` keep their historical 70% wording.

## Risks

- A leftover “70%” in the same file (source-of-truth bullet, late-resume sentence, or radio paragraph) would leave two bars in the contract.

## Implementation

### Files

- `docs/systems/playback-stats.md`

### Steps

1. In `docs/systems/playback-stats.md` **Source of truth**, change “70% cycle” to “65% cycle”.
2. In **What a listen is**, replace every “70%” with “65%”: the definition sentence, the playback-rate sentence, the late-resume sentence, and the radio “same 70% / pause / seek / late-resume rules” clause.
3. Grep living docs (exclude `docs/plans/`) for leftover “70%” that still means the listen bar:

```sh
rg -n "70%" docs --glob '!docs/plans/**'
```

No remaining hit should be the listen threshold. Do not edit `docs/plans/` or `docs/plans/ARCHIVED.md`.

### Verify

```sh
rg -n "70%|65%" docs/systems/playback-stats.md
```

Every listen-bar mention in that file is 65%. No code test run is required unless a later edit accidentally touched source.

## Acceptance

- `docs/systems/playback-stats.md` defines a listen as 65% accumulated media time and uses 65% in the late-resume and radio sentences.
- Living docs outside `docs/plans/` do not still call the listen bar 70%.
- Archived plans may still say 70%.
