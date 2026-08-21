# Stage 01: Delete leftover wrappers

## Status
done

## Description

Remove `applyCatalogPins`, `applyOutcomeSafely`, and `claimRadio`. Catalog pin is `firstPin` then `+= 1` in the txn. Outcome failure is an inline `try/catch` in `applyJobOutcome`. `tuneIn` calls `suspendMediaSession()`.

## Rationale

These three names do not own a model. Leaving them means the next edit treats increment, try/catch, and Media Session suspend as APIs.

## Invariants

- Catalog mutex, in-txn `firstPin` (read existing inside the txn), one finalize txn, art-after, IDB-then-unlink stay.
- `MAX_CONCURRENT` stays 2.
- `claimOnDemand` still runs the radio-exit hook then `restoreMediaSession`.
- No new helper that is `firstPin ? n + 1 : n`.

## Risks

- Radio store tests mock `claimRadio`. Delete that mock export or the suite fails.
- `handoff.test.ts` asserts `claimRadio` does not run the on-demand hook. Drop that case or assert `suspendMediaSession` if you still want coverage (do not keep `claimRadio` as a test-only alias).

## Implementation

### Files

- `frontend/src/downloads/catalog.ts`
- `frontend/src/downloads/worker.ts`
- `frontend/src/playback/onDemandControl.ts`
- `frontend/src/stores/radio.ts`
- `frontend/tests/downloads/catalogWriter.test.ts` (delete if both tests go)
- `frontend/tests/playback/handoff.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `persistCatalogTrack`, keep `firstPin = !existing`. If `n.albumId`, increment `album.refCount` only when `firstPin`. If `firstPin`, increment each artist `refCount` by 1. Delete `applyCatalogPins` and every call.
2. In `applyJobOutcome`, `try { await handler(...) } catch { mark ACTIVE row failed; finishQueueRow }`. Delete `applyOutcomeSafely`.
3. Delete `claimRadio`. In `tuneIn`, call `suspendMediaSession()` where `claimRadio()` is today.
4. Delete pin + `applyOutcomeSafely` tests. If `catalogWriter.test.ts` is empty of cases, delete the file. Update `handoff.test.ts` and the radio `onDemandControl` mock.

### Verify

- `rg -n "applyCatalogPins|applyOutcomeSafely|claimRadio" frontend/src frontend/tests` is empty.
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- Catalog pin is in-txn increment on `firstPin`. No pin helper.
- `applyJobOutcome` contains the `try/catch`. Nothing exports a generic apply/onThrow wrapper.
- `claimRadio` does not exist. Tune-in still suspends on-demand Media Session before `stopOnDemandSinks`.
- Typecheck and frontend tests pass.
