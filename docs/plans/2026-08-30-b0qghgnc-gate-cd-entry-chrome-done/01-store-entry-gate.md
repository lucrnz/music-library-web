# Stage 01: Store entry predicate, leave on disable, refuse enter

## Status
done

## Description

Export `cdEntryAllowed()` from the CD store. Leave a live CD session when Enable is turned off or the selected drive is cleared. Make `enterCdMode` a no-op when the predicate is false. Keep `canShowCdUi()` platform-only.

## Rationale

The icon and tab cannot hide on a shared rule, and `/cd` cannot bounce, until the store is the single place that knows “CD is set up.” Leave-on-disable must land here so a later chrome hide cannot trap a live session.

## Invariants

- `canShowCdUi()` stays Mac PWA / loopback-dev only. It does not read `cd.enabled` or `selectedDriveId`.
- Disabling CD still keeps `selectedDriveId` / `selectedDriveKey` (existing persist rule).
- `become("cd")` still does not stash or rewrite `playlist.v1`.
- Drive missing (id stored, not in `cd.drives`) is still a picked drive: `cdEntryAllowed()` stays true when capable + enabled.
- `toggleCdSession` while session is already `cd` still `become("none")` even if the predicate is now false.

## Risks

- Existing `enterCdMode` tests never set Enable + drive. Gating enter without updating those cases will make them no-op and go red.
- `setCdEnabled(false)` must `become("none")` only when session is `cd`, not when radio or queue is up.

## Implementation

### Files

- `frontend/src/stores/cd.ts`
- `frontend/tests/stores/cd.test.ts`

### Steps

1. In `frontend/src/stores/cd.ts`, export `cdEntryAllowed()` as `canShowCdUi() && cd.enabled && !!cd.selectedDriveId`. Do not add a persisted flag. Do not import the CD store from `capability.ts`.
2. `setCdEnabled`: after persist + `setOpticalWantsSocket`, if `!cd.enabled` and `activeSession() === "cd"`, `become("none")`. Then `syncCdWatch()` as today. Do not clear the drive pick.
3. `setCdSelectedDriveId`: after persist, if the new id is null and `activeSession() === "cd"`, `become("none")`. Changing to another non-null id still only rematches watch.
4. `enterCdMode`: if `!cdEntryAllowed()`, return without `become("cd")`, `openCdRail()`, watch, or identify — including the already-cd branch. `toggleCdSession` keeps “if session is cd, leave; else `enterCdMode()`.”
5. In `frontend/tests/stores/cd.test.ts`, keep `stubMacPwa()`. Any test that expects `enterCdMode` to take session `cd` must `setCdEnabled(true)` and `setCdSelectedDriveId` first (the “second desktop toggle”, “re-enter keeps shuffle”, identify-on-enter, and later `enterCdMode` cases).
6. Add tests: `cdEntryAllowed()` is false when disabled, false when enabled with no drive, true when capable+enabled+drive, true when that drive is missing from `setCdLive({ drives: [] })`. `setCdEnabled(false)` while session is `cd` (register `onLeaveCd(() => leaveCdMode())`) becomes `none` and keeps the drive id. `setCdSelectedDriveId(null)` while session is `cd` becomes `none`. `enterCdMode` without Enable+drive leaves `activeSession()` at `none`. `setCdEnabled(false)` while session is not `cd` does not call `become("cd")` and does not change a radio/queue occupant if the test already has one — at minimum, session stays `none` when it started `none`.

### Verify

```sh
pnpm --dir frontend exec vitest run tests/stores/cd.test.ts
```

## Acceptance

- `cdEntryAllowed()` is true only for capable + Enable on + a stored drive id, including drive-missing.
- Turning Enable off, or clearing the drive, while session is `cd` leaves through `become("none")`.
- `enterCdMode` without that predicate does not occupy CD.
- Disabling still persists the last drive id.
- Existing session-toggle and re-enter tests still pass after they set Enable + drive.
