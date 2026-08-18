# Stage 02: Living docs

## Status
done

## Description

Record that ActionMenu copy rows use the `copy` sprite so the previous plan’s “label-only, no glyph” rule cannot be rediscovered from `docs/frontend/conventions.md`.

## Rationale

The last archived plan explicitly forbade a copy glyph. Living docs must contradict that, or the next agent will treat label-only as the product rule.

## Invariants

- Edit the existing Copy bullet in `docs/frontend/conventions.md`. Do not add a new system page.
- Do not treat this plan directory as living documentation.

## Risks

- None

## Implementation

### Files

- Change: `docs/frontend/conventions.md` (Copy bullet: ActionMenu copy rows use `icon: "copy"` / `#i-copy`; Settings pills stay text-only)
- Do not change: `docs/README.md`

### Steps

1. After the `copyText` sentence, add that ActionMenu copy items (including Copy lyrics) set `icon: "copy"` against `i-copy` in `frontend/index.html`. Settings diagnostic Copy pills stay text-only.
2. Do not list item ids or SVG path data.

### Verify

```sh
# docs only
```

Read the Copy bullet and confirm it no longer implies label-only copy rows.

## Acceptance

- [ ] Conventions state ActionMenu copy rows use `copy` / `i-copy`, and Settings pills do not.
- [ ] This plan is not cited as the source of truth.
