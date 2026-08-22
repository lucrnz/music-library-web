# Stage 02: PlayIntent contract

## Status
done

## Description

`resolvePlaySource` returns delivery only. `resolvePlayIntent` is the only constructor that attaches a sink. `failCurrentLoad` loses the flag bag; `applyIntent` is the only play-source writer.

## Rationale

Downloads must not know sinks. The fail options object is the four old fail functions wearing a suit. This is the load-path delete before radio extract touches `player.ts` again.

## Invariants

- Exclusive still refuses lossy and downloads (`exclusive_lossy` / companion + streaming).
- Offline / broken / policy delivery rules in `resolvePlaySource` do not change.
- `loadResolved` still remints once after `markDownloadBroken` with `localBroken: true`.
- `needsCompanionStop` stays next to `PlayIntent`.
- No `playTypes.ts`.

## Risks

- Tests mock `resolvePlaySource` as returning a full `PlayIntent` with `sink`.
- A missed `url!` or unavailable-with-sink object reintroduces the old union hole.

## Implementation

### Files

- `frontend/src/downloads/resolve.ts`
- `frontend/src/playback/playIntent.ts`
- `frontend/src/stores/player.ts`
- `frontend/tests/playback/playIntent.test.ts`
- `frontend/tests/downloads/resolve.test.ts`

### Steps

1. In `frontend/src/downloads/resolve.ts`, stop importing `PlayIntent`. Return a delivery result owned by this file: `{ source: "unavailable", profile, block, message }` or `{ source: "streaming" | "downloaded", url, profile }`. Delete `htmlReady` / `unavailable` helpers that built `PlayIntent`.
2. In `frontend/src/playback/playIntent.ts`, map that delivery onto `PlayIntent` (`sink: "htmlAudio"` on ready HTML paths). Exclusive still builds companion+streaming here. Delete `PlayIntentCtx.absoluteStream`; exclusive `hrefForStream` always passes `absolute: true`. Keep `sourceKindSupported === false` as `codec_unsupported`.
3. In `frontend/src/stores/player.ts`, `applyIntent` remains the only `setPlaySourceState` writer. Replace `failCurrentLoad`’s options bag with `{ reason, message?, toast?: boolean | string }`. Derive title prefix (non-exclusive) and `openSettings` (`exclusive_needs_device` or reason starts with `exclusive` when today’s call sites opened Settings) from the reason. Delete `setUnavailable`, `stopSink`, `openSettings`, `title`, `profile`, `notice` flags. Unavailable intents call `applyIntent` then the toast/notice helper — do not write play-source twice. Companion `onError` and `loadResolved` catch go through the same helper; do not re-decide exclusive with `isExclusiveEnabled()`.
4. Update `frontend/tests/playback/playIntent.test.ts` and `frontend/tests/downloads/resolve.test.ts` for the delivery result (no `sink` from resolve). Fail-path tests that exist on `loadResolved` / play-intent keep today’s reasons and toasts.

### Verify

- `pnpm --dir frontend test -- frontend/tests/playback/playIntent.test.ts frontend/tests/downloads/resolve.test.ts frontend/tests/playback/playBlock.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "sink: \\\"htmlAudio\\\"" frontend/src/downloads/resolve.ts` is empty
- `rg -n "setUnavailable|absoluteStream" frontend/src/stores/player.ts frontend/src/playback/playIntent.ts` is empty

## Acceptance

- `resolvePlaySource` never returns `sink`.
- Ready HTML intents get `sink: "htmlAudio"` only inside `resolvePlayIntent`.
- `failCurrentLoad` has no `setUnavailable` / `stopSink` / `openSettings` / `title` flags.
- `applyIntent` is the only play-source writer on the load path.
- Exclusive and offline/broken/policy behavior match today.
