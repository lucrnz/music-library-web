# Stage 06: Living docs

## Status
done

## Description

Write the two decisions that outlive this plan into the project’s normal docs: finalize recounts album duration, and the SPA uses hyphen separators plus the album meta line.

## Rationale

`design.md` is not living documentation. The next scan or copy change will miss these rules if they only exist in the plan directory.

## Invariants

- Do not copy `duration_ms` column lists into `docs/database/overview.md`.
- Do not restate encoder argv, route tables, or serializer key lists.
- Hyphen rule applies to user-facing separators only; empty-value `—` stays.

## Risks

- Over-documenting field names will rot. One sentence on the recount rule is enough.

## Implementation

### Files

- `docs/systems/library-scan.md`
- `docs/frontend/conventions.md`

### Steps

1. In `docs/systems/library-scan.md`, in the finalize / aggregates discussion (source-of-truth line for `finalize.recount_entities` and pipeline step 7), state that finalize also recounts album total duration from present tracks and stores null when any present track lacks duration. Do not paste the SQL.
2. In `docs/frontend/conventions.md` UX conventions, add: album browse meta is `year · N tracks · m:ss` (artist prefixed on flat album lists); unknown length is omitted, never `0:00`; user-facing sentence separators are ASCII hyphen-minus, not em dash; standalone empty-value `—` is unchanged.

### Verify

```sh
# no automated doc tests — read the two pages named in Files
```

Confirm those two pages match what stages 01–05 shipped. Do not edit `docs/plans/`.

## Acceptance

- `docs/systems/library-scan.md` says album duration is a finalize aggregate with the null-if-incomplete rule.
- `docs/frontend/conventions.md` states the album meta recipe and the hyphen-vs-empty-glyph rule.
- No serializer field dump and no plan-directory edits.
