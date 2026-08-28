# Stage 03: Soft-fail play() after src is attached

## Status
done

## Description

If the HTML sink has already set `src` and `audio.play()` rejects with `NotAllowedError` or a same-generation `AbortError`, treat the load as attached-but-paused. Do not `failCurrentLoad`. The next Play is `resume()` (stage 02) under a real user gesture.

## Rationale

Codec change calls `play()` from a Vue watch. After a long `ensure_stream` wait the autoplay gesture is often gone, so `play()` rejects even though the new file is ready. Today that becomes `play_failed` / `unavailable`, and Play starts a fresh `playIndex`. Stage 02 already avoids a reload when `playSource` stays `streaming`; this stage keeps it there.

## Invariants

- Soft reject only after `setHtmlAudioSrc` has run in that `load` call.
- Soft names: `NotAllowedError`, `AbortError`. Other `play()` failures and `HTMLMediaElement` `error` events stay hard (`play_failed`).
- Wrapping in `PlayBlockError` must not drop the name: classify the raw DOM error before wrap, or rethrow the raw error for the soft path.
- Soft path: `playSource` remains `streaming` or `downloaded` as `applyIntent` already set; sink stays paused; `loadPending` clears as a successful generation; `pendingResume` still flushes when duration is known.
- Stale-generation `AbortError` (`!still(gen)`) is ignored, not a soft success and not a fail.
- Companion `load` is unchanged (no HTML `play()`).

## Risks

- Treating every `AbortError` as success can hide a user stop. Gate on `still(gen)` first.
- `new PlayBlockError("play_failed", err.message)` loses `err.name`. Classify before that wrap.

## Implementation

### Files

- `frontend/src/playback/playReject.ts`
- `frontend/tests/playback/playReject.test.ts`
- `frontend/src/playback/sinks/htmlAudioSink.ts`
- `frontend/src/playback/load.ts`

### Steps

1. Add `frontend/src/playback/playReject.ts` exporting `isSoftPlayReject(err: unknown): boolean` — true when `err` is an `Error` (including `DOMException`) whose `name` is `NotAllowedError` or `AbortError`.
2. Add `frontend/tests/playback/playReject.test.ts`: both names true; `PlayBlockError("play_failed")` false; generic `Error` false; non-errors false.
3. In `frontend/src/playback/sinks/htmlAudioSink.ts` `load`, after `setHtmlAudioSrc`, if `audio.play()` rejects and `isSoftPlayReject(err)`, resolve `load` successfully (do not throw). Any other rejection stays a `PlayBlockError` as today.
4. In `frontend/src/playback/load.ts` `attemptPlay`, if `!still(gen)` after `load` settles, return the existing stale failure without `failCurrentLoad` (caller already returns). Do not add a second fail path for soft rejects — they never throw.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/playback/playReject.test.ts
pnpm --dir frontend typecheck
```

On a running app: change Streaming on a playing lossless track to an uncached profile. If Chrome blocks autoplay after the wait, the notice must not become `Playback failed`; Play once must start at the held seek without a second encode wait. A genuinely bad URL must still show the play-failed notice.

## Acceptance

- Soft `play()` reject leaves `playSource` as `streaming` or `downloaded` and does not toast / set `playNotice` to play-failed.
- The next Play calls `resume()` on the attached element (stage 02 `resume` action).
- Hard media errors still `failCurrentLoad`.
- `playReject.test.ts` and `pnpm --dir frontend typecheck` pass.
