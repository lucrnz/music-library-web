# Stage 04: Living docs

## Status
done

## Description

Record the live codecs probe, the named play-online gate, and queue offline gray/skip on the systems pages.

## Rationale

026 already documented session-confirmed play. The helper and queue behavior will rot if they only live in this plan directory.

## Invariants

- Storage keys, timeout ms, and fetch argv stay in source.
- Plan 018’s “no stream-fail → local while confirmed reachable” remains.

## Risks

None

## Implementation

### Files

- Change `docs/systems/playback.md`
- Change `docs/systems/connectivity.md`
- Change `docs/systems/downloads.md` only if the playable join / queue gray needs a pointer

### Steps

1. **playback.md:** boot `GET /api/codecs` is a live probe (`cache: "no-store"`). Play-source online is `canUseRemoteMedia()`. Local-fail stream fallback uses that helper; unconfirmed → `broken`.
2. **playback.md:** when downloads are enabled and `!canUseRemoteMedia()`, queue rows without a playable local file (`ready`/`other`) are shown unavailable; next/prev/ended skip them; tap still plays. Point at player transport + `PlaylistView`, not this plan.
3. **connectivity.md:** `canUseRemoteMedia()` is the play/queue-offline gate; `canReachServer()` stays for prepare/queue-pump. Codecs GET is not served from HTTP cache.

### Verify

- `rg "canUseRemoteMedia|no-store|HTTP cache" docs/systems` — probe + helper documented.
- `rg "skip" docs/systems/playback.md` — queue skip mentioned.
- No link to this plan directory as living SOT.

## Acceptance

- [ ] playback.md documents live probe, named gate, local-fail fallback, queue gray/skip.
- [ ] connectivity.md does not imply a cached codecs GET can confirm, and names `canUseRemoteMedia()`.
- [ ] This plan directory is not linked as living documentation.
