# Stage 03: Listen accumulator

## Status
done

## Description

Add a pure client module that implements the 70% play-cycle rules and returns a listen event. No storage, no `player.ts`, no fetch.

## Rationale

`player.ts` is off-limits to the frontend test harness. If the 70% / seek / repeat-one rules live only in the loader, they will never have tests (same reason resume position is a separate module). Policy: [listen-policy.md](context/listen-policy.md).

## Invariants

- The module does not import `player.ts`, sinks, Vue, `@/api`, or storage.
- Seek epsilon is exactly **2** seconds, exported as a named constant.
- Threshold is **0.7**, exported as a named constant.
- `createListenCycle({ trackId, durationSec, profile, playSource })` returns `{ onTime, onEnded, onRestart }`.
- `onTime({ currentTime, duration, playing })` and `onEnded()` return `ListenEvent | null`.
- `onRestart()` returns `null` and resets listened time, last currentTime, and the fired flag (same track/profile/source).
- `durationSec` that is `null`, `NaN`, or `≤ 0` is unknown; adopt the first finite `duration > 0` from a later `onTime`.
- First `onTime` (no last currentTime) sets last and adds nothing.
- Ranking DTOs do not live in this file.
- No resume special case. Cold-load resume is a seek; policy lives in [listen-policy.md](context/listen-policy.md).
- If `playSource` is not `streaming` or `downloaded`, never fire.
- If not `playing`, set last currentTime only.
- If `0 < delta ≤ 2`, add delta; if `delta ≤ 0` or `delta > 2`, treat as seek (update last, do not add or subtract).
- Adopt a newly known finite `duration > 0` when the cycle’s duration was unknown.
- Fire at most once when `listenedSec >= 0.7 * duration`.
- `onEnded()` fires only when duration is still unknown. Known duration below 70% returns `null`. Already-fired returns `null`.
- Fire payload: `{ id, trackId, profile, playSource, countedAt }` with `crypto.randomUUID()` and ISO-8601 UTC `countedAt`. No UUID fallback.
- Tests do not import `player.ts`.

## Risks

- Sparse `timeupdate` gaps just over 2s would under-count. 2s is the agreed seek detector; do not “catch up” large gaps.

## Implementation

### Files

- Create: `frontend/src/listens/accumulator.ts`
- Create: `frontend/tests/listens/accumulator.test.ts`

### Steps

1. Export `LISTEN_SEEK_EPSILON_SECONDS = 2`, `LISTEN_THRESHOLD = 0.7`, types, and `createListenCycle`.
2. Implement the rules in Invariants / [listen-policy.md](context/listen-policy.md).
3. Node tests:
   - 70% via many 0.5s playing samples fires once; further samples return null
   - paused samples do not add
   - `delta = 3` does not add (seek forward)
   - seek-back (`currentTime` drops) does not subtract and does not add
   - first sample adds nothing
   - `durationSec: 0` / `NaN` is unknown; `onEnded` fires; a later finite `duration` then 70% fires instead
   - unknown duration + `onEnded` fires; known duration at 50% + `onEnded` returns null
   - tag duration missing, sink duration appears later, then 70% of that duration fires
   - `onRestart` after a fire allows a second event
   - `playSource: "none"` never fires
   - `countedAt` is a parseable UTC string; `id` changes per fire

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

## Acceptance

- [ ] Threshold, epsilon, cycle reset, and unknown-duration `ended` match [listen-policy.md](context/listen-policy.md).
- [ ] `onTime` / `onEnded` return `ListenEvent | null`; one fire per cycle is tested.
- [ ] No UUID fallback. Neither the module nor its test imports `player.ts`.
