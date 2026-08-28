**Archive.** Decisions in this file were current as of 2026-08-28 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Stream codec change: keep seek, wait out the encode

## Goal

Changing the Streaming codec must keep the current queue track at the current seek, not 0. Play during the following encode wait must not abort that load or start the song over.

## Settled decisions

- Queue on-demand only. Radio already re-seeks to the station clock after a Streaming change. The Streaming picker is hidden while Exclusive Audio is on; the exclusive-enabled reload already passes `resumeAt` / `resumePaused`.
- Reuse that exclusive reload: persist position, `playIndex` with `resumeAt: player.currentTime` and `resumePaused` from the active sink. Stay paused if paused; stay playing if playing.
- Stop the old stream immediately, then start the new URL at the saved seek. Do not overlap two media loads.
- Re-resolve delivery (a downloaded row may now prefer stream). Position still carries across.
- An in-flight queue load is the play intent. Extra Play/Pause taps must not bump `playGen`, abort `/api/stream`, or start a second encode wait. They only flip a want-paused latch applied when the load finishes.
- If `audio.play()` rejects after the new `src` is attached (`NotAllowedError`, same-generation `AbortError`), keep the stream loaded and paused. The next Play is `resume()` only.
- Hard media/network failures still go through `failCurrentLoad`. A later Play on `unavailable` / `none` must pass `resumeAt` from the held face time or the resume slot — it must not `clearPlaybackPosition()` and start at 0.
- Seek face stays on the held seconds while `pendingResume` is live. `beginLoad` → sink `stop` must not paint 0.
- Play button shows a busy state while `player.loadPending` is true (mini bar and expanded transport).
- No server change. `GET /api/stream` still blocks until `ensure_stream` finishes. No encode-progress API.
- No ADR. Living docs: `docs/systems/playback.md`, `docs/frontend/conventions.md`.
- Tests stay in extracted helpers. Do not import `player.ts` from Vitest (existing testing policy).

## Design

Today the Streaming watch calls `playIndex(pl.index)` with no resume opts. Because `playSource` is already `streaming` / `downloaded`, that path is not a cold load: `seekTo` is null, the resume slot is cleared, and the new `/api/stream?codec=` starts at 0.

`GET /api/stream` waits on `ensure_stream` before the `FileResponse`. `beginLoad` stops the HTML sink and sets `playSource` to `none`, so the Play icon returns. A tap then calls `playIndex` again, increments `playGen`, and abandons the first request. A `play()` reject after a long wait goes through `failCurrentLoad` (`unavailable`); the next Play is again a no-`resumeAt` `playIndex` that clears the slot.

Exclusive toggle already has the reload we want:

```text
persistCurrentPosition()
playIndex(index, { resumeAt: currentTime, resumePaused: sink.paused })
```

Use that same helper for the Streaming watch (and keep exclusive on it so the two cannot drift).

```text
setStreamCodec
    │
    ▼
prepareTracks(replace: true)          (unchanged)
    │
    ▼
reloadCurrentQueueTrack
    persist slot
    playIndex(resumeAt, resumePaused)
    │
    ├─ beginLoad          playSource=none, loadPending=true, do not paint 0
    ├─ /api/stream        blocks until encode
    ├─ pendingResume      seek when duration is known
    └─ resumePaused       pause after load if that was the state
              │
              ▼
     Play/Pause while loadPending
              │
              └─ flip want-paused only (no playGen++)
```

Play after a soft `play()` reject hits `ensureAudible` → `resume()` because `playSource` stayed `streaming` / `downloaded`. Play after a hard fail reloads with `resumeAt`.

## Stage map

1. **Resume on codec change** — the reported seek-to-0 bug. Independent; exclusive already proves the opts.
2. **Play tap must not restart a wait** — depends on 01 so a legitimate reload still has a slot / held time. Highest-impact Play resilience.
3. **Soft-fail `play()` after src is set** — depends on 02 so a user tap after autoplay-block is `resume()`, not a second `playIndex`.
4. **Busy Play face** — depends on 02’s `loadPending` flag; chrome only.
5. **Living docs** — write against 01–04 as shipped.

## Out of scope

- Radio Streaming changes (station clock, `tune_in` + `loadCurrent`)
- Keeping the old codec audible until the new encode is ready
- Serving a partial encode or adding a “ready” / progress endpoint
- Changing prepare / `replace: true` / forget
- Listen-cycle policy on codec change (existing discard + new cycle)
- Importing `player.ts` in Vitest
- Safari / Firefox / iOS clients

## Assumptions

- Grill questions were declined; these are the recommended answers.
- Chromium / first-party clients allow `play()` after a user tap even when a Vue-watch `play()` was blocked.
- Same-generation `AbortError` after `src` is set is a lost autoplay race, not a missing file.
- A one-turn restore of `player.currentTime` after `beginLoad` is enough to avoid a seek-bar flash (pause is sync).
- `player.ts` may keep owning watches and transport; new helpers stay importable without pulling the store.
