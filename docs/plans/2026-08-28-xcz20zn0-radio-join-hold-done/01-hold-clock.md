# Stage 01: Hold clock

## Status
done

## Description

Add a pure 8 s join-hold clock: `pending` after `start()`, not `pending` after 8 s or `cancel()`. No session, store, or audio imports.

## Rationale

Stage 02 needs a latch the pause handlers can read and tests can advance with fake timers. Putting that timer in `session.ts` first would mix clock bugs with chrome bugs.

## Invariants

- `RADIO_JOIN_HOLD_MS` is `8000`.
- `start()` sets `pending` true, clears any existing timer, and arms one `setTimeout` for `RADIO_JOIN_HOLD_MS`.
- When that timer fires, `pending` is false and there is no leftover timer.
- `cancel()` clears the timer, sets `pending` false, and is safe to call when nothing is armed.
- A second `start()` before the first timer fires is one timer, 8 s from the latest `start()`.
- The clock never calls `tuneOut`, `schedule`, or `loadCurrent`.

## Risks

None

## Implementation

### Files

- `frontend/src/radio/hold.ts`
- `frontend/tests/radio/hold.test.ts`

### Steps

1. Create `frontend/src/radio/hold.ts` exporting `RADIO_JOIN_HOLD_MS = 8000` and `createJoinHold()` with `pending` (getter), `start()`, and `cancel()` as in Invariants. Use `setTimeout` / `clearTimeout` only.
2. Create `frontend/tests/radio/hold.test.ts` with fake timers (`afterEach` restores real timers): `start()` makes `pending` true; advancing `RADIO_JOIN_HOLD_MS` makes `pending` false; `cancel()` after `start()` leaves `pending` false and advancing 8 s does not revive it; a second `start()` 3 s into the first window needs a full 8 s from the second `start()` before `pending` is false; `cancel()` on a fresh clock does not throw.

### Verify

```sh
pnpm --dir frontend test tests/radio/hold.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- `createJoinHold()` is the only new runtime API. `pending` is true only between `start()` and (timer fire or `cancel()`).
- No file outside `frontend/src/radio/hold.ts` and `frontend/tests/radio/hold.test.ts` changes in this stage.
