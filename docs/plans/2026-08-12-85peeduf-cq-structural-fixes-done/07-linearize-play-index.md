# Stage 07: Linearize playIndex attempt / fallback

## Status
done

## Description

Restructure `playIndex` in `stores/player.js` into a linear attempt pipeline (vocabulary from stage 05).

1. Resolve play source.
2. If unavailable → notice + transport flags; return.
3. `attemptPlay(source)` — set `audio.src`, `await audio.play()`, return ok/fail.
4. On fail, if source was **downloaded** and online → `markDownloadBroken`, revoke blob URL, **build stream URL directly** via `streamUrl(track, activeCodec)` (do **not** re-call `resolvePlaySource` with forced policy), set face `streaming`, second `attemptPlay`.
5. On fail → `failPlayback`.
6. Settled paths end in `syncTransportFlags`.

Unchanged: near-end prepare, cover resolve, media session.

## Rationale

Nested try/catch for local-fail fallback obscures the main path. Direct stream URL matches today’s behavior and keeps resolve as the online policy decider, not the emergency fallback path.

## Implementation

1. Extract `attemptPlay` without fallback policy inside it.
2. Single clear second attempt with guards (`isHardOffline`, stream URL present).
3. Keep atomic `setPlaySourceState` / `failPlayback`.
4. Browser-verify: stream, local, broken local online (stream + mark broken), broken local offline (unavailable), stream play_failed; covers + near-end prepare still correct.
