# Stage 03: Desktop companion-download capability

## Status
done

## Description

Add pure platform / install helpers: desktop (Mac, Windows, Linux), installed PWA, and `canUseCompanionDownloads`. No Settings or enable-path change yet.

## Rationale

Later gates (tab toast, companion-required enable, Settings split) need one testable predicate. Exclusive UI stays `isMacPlatform() && isInstalledPwa()`.

## Invariants

- `canShowExclusiveUi()` is unchanged (Mac + installed PWA).
- `canUseCompanionDownloads()` is true only when `isDesktopPlatform()` and `isInstalledPwa()`.
- `isDesktopPlatform()` is Mac or Windows or Linux (UA + `userAgentData.platform` when present, same pattern as `isMacPlatform`).
- Android is not desktop.

## Risks

- Linux UA strings vary (`Linux` vs `X11`). Match `/Linux/i` on platform/UA and treat Android as not Linux (`Android` wins).

## Implementation

### Files

- `frontend/src/exclusive/capability.ts`
- `frontend/tests/exclusive/capability.test.ts`

### Steps

1. In `frontend/src/exclusive/capability.ts`, add `isWindowsPlatform`, `isLinuxPlatform` (false when Android), and `isDesktopPlatform` (`isMacPlatform() || isWindowsPlatform() || isLinuxPlatform()`). Prefer `userAgentData.platform` when set, else `navigator.platform` / `userAgent`, matching `isMacPlatform`.
2. Export `canUseCompanionDownloads()` as `isDesktopPlatform() && isInstalledPwa()`.
3. Add `frontend/tests/exclusive/capability.test.ts` that stubs `navigator` / `matchMedia`: Mac+standalone → exclusive and companion true; Windows+standalone → companion true, exclusive false; Android+standalone → both false; Mac+not standalone → both false; Linux UA with `Android` → not desktop.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/exclusive/capability.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Installed Mac PWA: exclusive UI and companion downloads both allowed.
- Installed Windows or Linux PWA: companion downloads allowed, exclusive UI hidden.
- Android PWA and any desktop tab: `canUseCompanionDownloads()` is false.
