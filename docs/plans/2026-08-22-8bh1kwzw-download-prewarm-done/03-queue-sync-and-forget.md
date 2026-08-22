# Stage 03: Queue sync and forget

## Status
done

## Description

On download-queue membership/state changes and on boot, POST the current 8-row window with `tier: "download"` when the server is reachable. On cancel or clear of not-yet-complete rows (including disable-and-clear), forget those track ids unless they are still on the play queue. User-pause still syncs; clear-finished does not forget.

## Rationale

Stages 01–02 are inert to the user. This is the behavior change: album/artist enqueue starts background encodes, and dropping unfinished work frees the worker.

## Invariants

- Sync runs after queue membership/state changes and after a successful downloads boot/enable `refreshQueue`. Not on byte-progress ticks.
- Sync no-ops when downloads are disabled, or `canReachServer()` is false. User-pause does **not** no-op.
- Each window group calls `requestPrepare(ids, codec, { tier: "download" })`. De-dupe against the last successfully posted window (same codec+id set) so an unchanged queue does not re-POST.
- Forget uses existing `requestForget`. Client retain set is `pl.tracks` ids. Server retain stays radio-only.
- Forget on: single cancel of a pending/active/paused row; `clearAllQueue` / disable-and-clear (all unfinished ids). Not on `clearFinishedQueue`. Not when a row becomes active or completes. Not when the window slides.
- `queue.ts` still does not import `playback/prepare.ts` or this HTTP path.

## Risks

- Hooking sync to `onProgressChange` would spam prepare.
- Forgetting on window slide would cancel useful in-flight download-tier encodes just as the pump approached them.
- Forgetting clear-finished ids would evict a cache the play queue might still want.
- Importing `@/downloads` from the playlist store would cycle; this module reads `pl` from `@/stores/playlist`, not the other way around.

## Implementation

### Files

- `frontend/src/downloads/prewarm.ts`
- `frontend/src/downloads/index.ts`
- `frontend/tests/downloads/prewarm.test.ts`

### Steps

1. In `frontend/src/downloads/prewarm.ts`, add `syncDownloadPrewarm(rows)` and `forgetDownloadPrewarm(ids: string[])`. `syncDownloadPrewarm` returns immediately when `canReachServer()` is false; otherwise runs `selectDownloadPrewarmWindow`, skips groups identical to the last posted snapshot, and calls `requestPrepare(group.ids, group.codec, { tier: "download" })`. `forgetDownloadPrewarm` subtracts ids present on `pl.tracks` (from `@/stores/playlist`) and calls `requestForget` on the rest. Export a `resetDownloadPrewarmState()` for tests (clears the last-posted snapshot).
2. In `frontend/src/downloads/index.ts`, after `refreshQueue` updates `downloads.queue` inside `bindQueueListener` and at the end of `bootDownloadsRuntime` (after the existing `refreshQueue`), call `syncDownloadPrewarm` with that queue (void/catch like other fire-and-forget). Do not call it from `onProgressChange`.
3. In `frontend/src/downloads/index.ts` `cancelQueueItem`, load the row first (`listQueue` or the IDB get already used by runtime). After `cancelItem`, if the row existed and was not already a finished catalog skip, `forgetDownloadPrewarm([row.trackId])`.
4. In `frontend/src/downloads/index.ts` `disableDownloads`, `listQueue` before `clearAllQueue`, then `forgetDownloadPrewarm` of ids whose state is `pending`, `active`, or `paused`. Do not add forget to `clearFinishedQueue` or `clearStoredDownloads`.
5. In `frontend/tests/downloads/prewarm.test.ts`, mock `@/playback/prepare` (`requestPrepare`, `requestForget`) and `@/stores/playlist` (`pl: { tracks: [] }`). Cover: sync POSTs one download-tier group of 8; second sync with the same rows does not POST; `canReachServer` false skips; `forgetDownloadPrewarm` drops ids that are on `pl.tracks` and forwards the rest to `requestForget`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/downloads/prewarm.test.ts frontend/tests/playback/prepare.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Enqueueing more than 8 lossless tracks POSTs the first 8 download-codec ids with `tier: "download"` once the queue listener refreshes.
- User-paused rows still appear in that window; offline / server-down does not POST.
- Cancel or disable-and-clear forgets unfinished ids that are not on the play queue.
- Clear finished does not call `requestForget`.
- Play-queue `preparedKeys` / `prepareTracks` paths are unchanged.
