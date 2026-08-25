# Stage 02: Exclusive lossy source stream

## Status
done

## Description

When exclusive is on and the track is lossy, mpv loads the library `source` stream instead of hard-failing `exclusive_lossy`. No companion locker yet. SRC stays mpv/OS.

## Rationale

Unlocks exclusive play of indexed MP3/AAC without the blob store. Local-file exclusive is stage 08.

## Invariants

- Lossy exclusive with a streamable id is `sink: "companion"`, `source: "streaming"`, `profile` null or `source`, URL is absolute `/api/stream?id=&codec=source`.
- `exclusive_lossy` is not returned when a source URL can be built.
- `getExclusiveProfileTag` still returns null for lossy (no FLAC tag).
- Exclusive prepare still skips lossy (`shouldPrepare` already does).
- HTML and radio paths unchanged.

## Risks

- `activeDelivery().profileFor` returning null for lossy can break prepare grouping. Exclusive prepare must keep skipping those ids, not enqueue a null tag.

## Implementation

### Files

- `frontend/src/playback/playIntent.ts`
- `frontend/src/playback/deliveryPolicy.ts`
- `frontend/src/playBlock.ts`
- `frontend/tests/playback/playIntent.test.ts`

### Steps

1. In `frontend/src/playback/playIntent.ts` `exclusiveIntent`, remove the immediate `track.isLossy` → `blocked("exclusive_lossy")`. If `track.isLossy`, build `hrefForStream(track, "source", true)` and return companion streaming (profile `"source"` or null — pick one and use it in the test). If that URL is missing, then `exclusive_lossy`.
2. In `frontend/src/playback/deliveryPolicy.ts`, `profileFor` under exclusive: if `track?.isLossy` return `"source"`; else `getExclusiveProfileTag(track)`.
3. In `frontend/src/playBlock.ts`, change the `exclusive_lossy` user string so it is not “does not support lossy sources yet” (only the no-URL case remains). Keep the reason id.
4. In `frontend/tests/playback/playIntent.test.ts`, replace “blocks exclusive lossy” with: lossy + companion sink returns streaming, url contains `codec=source`, sink `companion`. Add a case with no id / failed href → `exclusive_lossy`. Keep the lossless exclusive tag assertion.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/playback/playIntent.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Exclusive + lossy track with an id loads an absolute `codec=source` URL into the companion sink.
- Exclusive + lossless still uses the exclusive FLAC tag, not `source`.
- Prepare does not POST a FLAC tag for a lossy id.
