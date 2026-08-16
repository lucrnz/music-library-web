# Stage 08: Per-track exclusive prepare (album daily driver)

## Status
done

## Description

When exclusive is **enabled**, all prepare/prewarm uses **`getExclusiveProfileTag(track)`** only—never `getActiveStreamCodec()`. Group prepares by tag. Near-end urgent prepare uses the **next** track’s exclusive tag. Auto-advance remains the stage-07 sink `ended` path; this stage only makes encodes warm for albums.

## Rationale

`getActiveStreamCodec()` stays browser Wi‑Fi/cellular forever. Overloading it for exclusive would break mixed-rate albums and thrash the worker with Opus while mpv plays FLAC.

## Implementation

- **`getActiveStreamCodec()`:** unchanged meaning—browser stream only. No exclusive branch.
- **`getExclusiveProfileTag(track)`:** formatPolicy + current device caps + format mode + exclusive-formats list.
- When exclusive **enabled**, short-circuit every prepare entry point that today does `requestPrepare(..., getActiveStreamCodec())`:
  - playlist enqueue prepare
  - `applyActiveStreamSideEffects` / settings network flips (skip browser codec prewarm or no-op for exclusive)
  - player near-end prepare
  - `tracksNeedingPrepare`: under exclusive enabled, do not skip for “prefer download”; exclusive always needs server stream tags
- Multi-tag queues: group track ids by exclusive tag; call `requestPrepare(ids, tag)` per group (existing API already takes one codec per call).
- Do not prewarm wifi/cellular browser codecs for the queue while exclusive enabled.
- Advance/gap behavior already owned by stage 07; only verify album play stays warm when prepare works.
- Manual: mixed 44.1/96 album; network tab shows prepare with correct per-track tags; no opus prepare while exclusive on; cold miss still plays.
