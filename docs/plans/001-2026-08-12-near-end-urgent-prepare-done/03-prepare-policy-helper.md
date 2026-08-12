# Stage 03: Single client prepare-policy helper

## Status
done

## Description

Make “does this track still need a stream prepare under current playback policy / downloads?” live in one place. `addToQueue` and near-end prepare both use it. Keep `requestPrepare` as the only HTTP + `preparedKeys` path, with an `urgent` option that always POSTs so the server can promote.

## Rationale

Near-end currently reimplements the local-prefer skip logic that already exists for queue add. That pulls OPFS/record policy into the player and will diverge. One helper is the prepare-policy boundary; transport code should not know `getTrackRecord`.

## Implementation

- Keep or lightly export the existing `tracksNeedingPrepare(tracks, activeCodec)` in `playlist.js` (or a tiny sibling module only if export would create a circular import — prefer staying in the prepare owner).
- Optionally add a thin `trackNeedsStreamPrepare(track, codec)` that wraps the list helper for the single next-track case.
- `addToQueue` continues: filter via helper, then `requestPrepare(toPrepare, active)` (non-urgent).
- Ensure `requestPrepare` in `api.js` supports `{ replace, urgent }`: urgent bypasses the “already in preparedKeys → skip POST” short-circuit so promotion still hits the server; still marks keys after send.
- No player changes required to finish this stage beyond not introducing a second copy of the policy (stage 04 consumes the helper).
