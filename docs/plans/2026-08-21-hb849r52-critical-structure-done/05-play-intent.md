# Stage 05: One play intent and one prepare path

## Status
done

## Description

Add `resolvePlayIntent` and a shared prepare helper. Delete `playHtml` / `playExclusive` as separate loaders. Playlist add-to-queue, settings codec change, and near-end prepare all call the same prepare function. `player.ts` may still import radio (`exitToQueue`); that leaves in stage 06.

## Rationale

The exclusive/HTML fork is what grows `player.ts`. Prepare is implemented three times with three skip policies. Intent-resolve is the cut that deletes both categories without moving the same branches into two files.

## Invariants

- Exclusive: `sink: companion`, `source: streaming`, never OPFS, refuse lossy (`exclusive_lossy`). Device/format failures stay the same `PlayBlockReason`s.
- HTML delivery still goes through `resolvePlaySource` in `downloads/resolve.ts`. Do not move that function into `player.ts`.
- `downloads/` must not import exclusive or `player.ts`.
- `playGen` / `activeSink` / blob-URL revoke stay in `player.ts`. Do not invent a 12-arg loader context object.
- Playback policy (`prefer_better` / `prefer_offline` / `prefer_stream`) is unchanged.
- Settings still owns stream/download codec prefs and the modal. It must not contain a group-by-exclusive-tag loop.

## Risks

- `playExclusive` has extra UX (missing-tech toast, `absoluteStreamUrl`, `ensurePreferredDevice`). Those stay as steps after intent, not as a second loader. Intent returns the tag/url/block; `player.ts` still performs the sink load.
- Settings `applyActiveStreamSideEffects` also restarts playback when the stream codec changes. Keep that restart in settings (or pass a callback). Only the prepare/grouping moves.

## Implementation

### Files

- `frontend/src/playback/playIntent.ts` (new)
- `frontend/src/playback/prepare.ts` (new)
- `frontend/src/stores/player.ts`
- `frontend/src/stores/playlist.ts`
- `frontend/src/stores/settings.ts`
- `frontend/tests/playback/playIntent.test.ts` (new)
- `frontend/tests/playback/prepare.test.ts` (new)

### Steps

1. Add `PlayIntent` (`sink`, `source`, `profile`, `url`, `block`, `prepareTag`) and `resolvePlayIntent(track, ctx)` in `playIntent.ts`. `ctx` includes exclusive-enabled, exclusive tag/device gate, downloads enabled, offline, active stream codec, playback policy, catalog, and `localBroken`. Exclusive branch does not call `resolvePlaySource`. HTML branch does. `localBroken: true` forces the streaming URL (or `broken` / `play_failed` when offline / no URL).
2. `playIndex`: after `beginLoad` / media-session bookkeeping, `const intent = await resolvePlayIntent(...)`; apply source state from intent; `selectSink(intent.sink)`; if blocked, `failPlayback` and return; else `attemptPlay(intent.url)`. Delete `playHtml` and `playExclusive`. Keep `ensurePreferredDevice` and the missing-tech toast as pre-steps that feed `ctx`, not as a parallel function.
3. Blob-load failure: `markDownloadBroken`, revoke object URL, then `resolvePlayIntent({ ...ctx, localBroken: true })` and retry once. No inline stream fallback beyond that.
4. Add `prepareTracks(tracks, opts: { urgent?: boolean; replace?: boolean })` in `prepare.ts`. Exclusive: group by `getExclusiveProfileTag`, `requestPrepare` each group. HTML: skip lossy and tracks that `willPreferLocal` (new helper on `resolve.ts` wrapping `shouldPreferLocalOnline` + catalog projection — **do not** import `catalogIndex` from `playlist.ts`). Settings codec-change and `issueNearEndPrepare` call this. Delete `requestExclusivePrepare` and the settings inlined map.
5. `tracksNeedingPrepare` / `trackNeedsStreamPrepare` become wrappers around the HTML half of `prepare.ts` or disappear if nothing else needs them.
6. Unit-test intent: exclusive lossy → block; exclusive lossless → companion + streaming + exclusive tag; HTML offline with no download → `offline_no_local`; HTML with prefer-local download → downloaded; `localBroken` + online → streaming. Unit-test prepare: exclusive groups two tags and does not pass the browser codec; HTML skips a projected local-better id.

### Verify

- `pnpm --dir frontend test`
- `pnpm --dir frontend typecheck`

## Acceptance

- `playHtml` and `playExclusive` do not exist. `playIndex` has one load path.
- `settings.ts` has no exclusive group-by-tag loop. `playlist.ts` does not import `catalogIndex`.
- Exclusive still never plays a download or a lossy track.
- Near-end prepare, add-to-queue, and stream-codec change share `prepareTracks`.
- `player.ts` is shorter than 875 lines (loaders gone; radio imports may still be present).
