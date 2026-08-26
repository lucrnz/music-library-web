# Stage 04: Now-playing and radio year

## Status
done

## Description

Print `Artist - Album (year)` on PlayerBar (mini + expanded sheet) and radio, using `track.year` and an ASCII hyphen.

## Rationale

Now-playing already names the album. Year belongs there as a parenthetical, not as the browse meta line. One helper stops PlayerBar and radio from drifting.

## Invariants

- Joiner is `" - "` (hyphen-minus, spaces). Not em dash.
- Year comes from `track.year`. If missing/falsy, no parentheses.
- Empty artist/album still collapse with `filter(Boolean)`.
- PlayerBar keeps its current fallback `"Unknown"` when both are empty.
- `radioSubtitle` keeps returning `""` when `track` is null; otherwise the same helper.
- Queue is not updated in this stage.

## Risks

- `track.year` can disagree with `albums.year` on reissues. That is the settled source.
- Radio tests hard-code `Artist — Album`; they must move to the hyphen form and cover a year case.

## Implementation

### Files

- `frontend/src/util.ts`
- `frontend/src/components/player/PlayerBar.vue`
- `frontend/src/stores/radio.ts`
- `frontend/tests/util.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/util.ts`, add `formatPlayingSubtitle(track: { artist?: string | null; album?: string | null; year?: number | null })`. Join artist and album with `" - "`; if `year` is truthy append ` (${year})`.
2. In `frontend/src/components/player/PlayerBar.vue`, replace the inline `[t.artist, t.album].join(" — ")` with `formatPlayingSubtitle(t) || "Unknown"`.
3. In `frontend/src/stores/radio.ts` `radioSubtitle`, return `""` when `!track`, else `formatPlayingSubtitle(track)`.
4. In `frontend/tests/util.test.ts`, add cases: `Artist - Album (1996)`; no year → `Artist - Album`; artist only; empty parts.
5. In `frontend/tests/stores/radio.test.ts`, change the `Artist — Album` expectation to `Artist - Album` and add a case with `year` set.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/util.test.ts frontend/tests/stores/radio.test.ts
pnpm --dir frontend typecheck
```

At implementation time, play a tagged-year track and confirm mini bar, expanded now-playing, and radio room/compact all show `Artist - Album (year)`. Confirm queue rows still have no year.

## Acceptance

- PlayerBar and radio show `Artist - Album (1996)` when `track.year` is 1996.
- Missing year is `Artist - Album` with no `()`.
- Queue subtitle is unchanged in this stage.
- The listed tests and `pnpm --dir frontend typecheck` pass.
