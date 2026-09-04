# Stage 06: Write gym-offline rules into living docs

## Status
done

## Description

Move the reachability, companion-download, backfill, offline flip/lyrics, and rejoin-floor rules out of this plan directory into the systems and frontend pages that already own those topics.

## Rationale

`context/design.md` is not living documentation. Operators and later agents will keep reading “play online is `canUseRemoteMedia` including `navigator.onLine`” unless `docs/systems/connectivity.md` and playback/downloads change after 01–05.

## Invariants

- No new standalone page and no new ADR. Update the existing map.
- Exact backoff numbers, header strings, and IDB field names stay in source; docs state intent and point at modules.
- Docs still say Downloads (OPFS / companion) are required for offline audio; the SW still does not cache `/api/*`.

## Risks

- Copying `navigator.onLine` caveats into both connectivity and playback so they drift — keep the rule in connectivity and point playback/downloads at it.

## Implementation

### Files

- `docs/systems/connectivity.md`
- `docs/systems/downloads.md`
- `docs/systems/playback.md`
- `docs/frontend/conventions.md`

### Steps

1. In `docs/systems/connectivity.md`, replace the play-gate wording that treats browser-offline as hard truth. State: published state follows live same-origin `/api` success/failure (`apiFetch` + health probe); `navigator.onLine` may start a probe and may choose Offline vs Can’t-reach copy after a failure; it does not veto `reportSuccess` or `canReachServer()`. Health loop runs while `offline` / `server_down` even with no download work. Point at `frontend/src/connectivity.ts` and `frontend/src/api.ts`.
2. In `docs/systems/playback.md`, say `canUseRemoteMedia()` is confirmed + `state === "online"` (no browser flag). A `playIndex` of a row that would be `offline_no_local` probes the stream once; a playable download still wins. Cover flip: local artist full or VA works while unreachable; remote flip still needs the server. Rejoin `kick()` waits at least 250ms; 1s → 8s schedule unchanged. Point at `playIntent.ts`, `resolve.ts`, `coverFlip.ts`, `rejoinClock.ts`.
3. In `docs/systems/downloads.md`, add companions: finalize stores album art, artist full + flip flags, and lyrics (`ok` / `instrumental` / `not_found`); placeholder artist-image is not a photo; miss does not fail the audio job. Existing rows backfill when online (on play + quiet walker, not the manager queue). Point at `writer.ts`, `art.ts`, `lyrics/cache.ts`, `downloads/backfill.ts`.
4. In `docs/frontend/conventions.md`, update the now-playing flip bullet: eligibility is local full / VA flags or the online artist GET; flip is not off solely because `canReachServer()` is false when a local full exists. Note lyrics overlay reads download IDB first.

### Verify

- `rg -n "navigator.onLine|browserOffline|canUseRemoteMedia" docs/systems/connectivity.md docs/systems/playback.md` describes live `/api` as truth, not the browser flag as a veto.
- `rg -n "250ms|kick\\(" docs/systems/playback.md` mentions the rejoin floor.
- `rg -n "backfill|artist full|not_found" docs/systems/downloads.md` hits the companion rules.
- This plan directory is not cited as the long-term source of truth.

## Acceptance

- Living docs match stages 01–05: reachability, probe-on-tap, companions, backfill, offline flip, 250ms kick floor.
- No second connectivity state machine documented. No new ADR.
