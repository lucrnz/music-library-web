# Stage 02: One play-decision type

## Status
done

## Description

Make `resolvePlaySource` return `PlayIntent`. Delete `PlaySource`, `ExclusiveGate`, and `exclusiveGate`. Collapse the four player fail paths into `failCurrentLoad`. Keep `localBroken` remint in `loadResolved`.

## Rationale

Play is still decided twice. One union and one fail function is the frontend judo that stops the next exclusive/offline branch from growing `player.ts`.

## Invariants

- Exclusive is still companion + streaming. Exclusive still refuses lossy and never uses OPFS.
- Device gate stays in `companionSink.load`. `intentForTrack` I/O stays in `player.ts`.
- `localBroken: true` still forces stream when online and `broken` when offline, without calling `resolvePlaySource`.
- Exclusive unavailable still toasts without a title prefix and opens Settings on `exclusive_needs_device`. Other unavailable notices still prefix `Title:`.
- Companion load/error still toasts and stops the companion sink. HTML `play_failed` still does not toast via the companion path.

## Risks

- Value-importing `playIntent.ts` from `resolve.ts` creates a cycle. Use `import type` only; build intent objects in `resolve.ts`.
- Collapsing fail paths can change toast/Settings side effects if args are guessed. Match each of the four current call sites.

## Implementation

### Files

- `frontend/src/downloads/resolve.ts`
- `frontend/src/playback/playIntent.ts`
- `frontend/src/stores/player.ts`
- `frontend/tests/playback/playIntent.test.ts`
- `frontend/tests/downloads/resolve.test.ts`

### Steps

1. In `frontend/src/downloads/resolve.ts`, `import type { PlayIntent } from "@/playback/playIntent"`. Change `resolvePlaySource` (and any private helper that currently returns `PlaySource`) to return `PlayIntent`: ready paths include `sink: "htmlAudio"` and `url`; unavailable paths match the existing `unavailable` variant (`source`, `profile`, `block`, `message`). Delete the `PlaySource` type. Do not import `blocked` or any value from `playIntent.ts`.
2. In `frontend/src/playback/playIntent.ts`, delete `ExclusiveGate` and `exclusiveGate` on `PlayIntentCtx`. Delete the `exclusiveGate` branch in `exclusiveIntent`. Map `resolvePlaySource`’s `PlayIntent` through (no `PlaySource` field copy). Keep the exclusive prefix and the `localBroken` / `sourceKindSupported` branches.
3. In `frontend/src/stores/player.ts`, replace `failPlayback`, `showUnavailable`, `failLoad`, and `hardStopCompanion` with one `failCurrentLoad` that the existing call sites (`onError`, unavailable intent, `attemptPlay` failure, exclusive missing-device) invoke with explicit args so today’s toast / Settings / sink-stop / emit / `setPlaySourceState` behavior is unchanged. `loadResolved` still remints once on local-broken after `markDownloadBroken`.
4. Update `frontend/tests/playback/playIntent.test.ts`: stop passing `exclusiveGate`; mock `resolvePlaySource` with `PlayIntent` objects (`sink: "htmlAudio"` on ready). Add or adjust a case that exclusive does not read a gate on the ctx.
5. Keep `frontend/tests/downloads/resolve.test.ts` on `shouldPreferLocalOnline` unless a `resolvePlaySource` unit test already asserts `PlaySource` fields — then assert `PlayIntent`.

### Verify

- `pnpm --dir frontend test -- frontend/tests/playback/playIntent.test.ts frontend/tests/downloads/resolve.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "export type PlaySource|ExclusiveGate|exclusiveGate|function failPlayback|function hardStopCompanion|function showUnavailable|function failLoad" frontend/src` is empty

## Acceptance

- `PlaySource` is gone. HTML and exclusive ready paths are both `PlayIntent`.
- `exclusiveGate` / `ExclusiveGate` are gone from source and tests.
- `player.ts` has one fail function; the four old names are gone.
- `loadResolved` still remints at most once for local-broken.
- `resolve.ts` does not value-import `playIntent.ts`.
