# Stage 02: Named play-online gate + local-fail

## Status
done

## Description

Add `canUseRemoteMedia()` on connectivity. Switch play resolve, player remote covers, and local-blob stream fallback to it. Do not copy `canReachServer() && hasConfirmedReachability()` a third time.

## Rationale

The leftover fallback bug is real, but pasting the conjunct again is the nuclear miss. Naming the gate deletes the special case and gives stage 03 one predicate.

## Invariants

- `canUseRemoteMedia()` is `canReachServer() && hasConfirmedReachability()`. `canReachServer()` semantics unchanged.
- `playHtml` resolve uses `offline: !canUseRemoteMedia()`.
- Cover `allowRemote` uses `canUseRemoteMedia()`.
- Local-fail stream fallback uses `if (!canUseRemoteMedia())` → existing `broken` path.
- Local fail still `markDownloadBroken` + revoke the blob URL.
- Confirmed reachable still streams after local fail (018: no new stream → local).
- `issueNearEndPrepare` and download-queue sites stay on bare `canReachServer()`.

## Risks

- A broken local file before the codecs GET confirms still says `broken` instead of streaming. Accept (026 window). Next play after `reportSuccess` can stream.

## Implementation

### Files

- Change `src/musicweb/static/js/connectivity.js`
- Change `src/musicweb/static/js/stores/player.js`

### Steps

1. In `connectivity.js`, next to `canReachServer` / `hasConfirmedReachability`, export `canUseRemoteMedia()` as the AND of those two. No new state.
2. In `player.js`, import `canUseRemoteMedia`. Replace the three play-online sites: `updateMediaSession` `allowRemote`, `resolvePlaySource` `offline`, and the downloaded `attemptPlay` fail gate. Drop `hasConfirmedReachability` from this file if unused.
3. Do not add a stream-fail → local branch.

### Verify

- `rg "canUseRemoteMedia" src/musicweb/static/js` — defined in `connectivity.js`; used from `player.js` (covers, resolve, fallback).
- `rg "hasConfirmedReachability\\(\\)" src/musicweb/static/js/stores/player.js` — no matches.
- `rg "canReachServer\\(\\) && hasConfirmedReachability" src/musicweb/static/js` — no matches.
- `rg "canReachServer\\(\\)" src/musicweb/static/js/stores/player.js` — prepare (and any non-play site) still bare.
- Manual (if easy): unconfirmed + bad local file → `broken`, no `/api/stream`.

## Acceptance

- [ ] Play-online is one named helper, used at resolve, covers, and local-fail fallback.
- [ ] Unconfirmed / unreachable local-play failure does not request `/api/stream`.
- [ ] After confirmation, local-play failure may still stream.
- [ ] `canReachServer()` unchanged for prepare and the download queue.
- [ ] No stream-fail → local added.
