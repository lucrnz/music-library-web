# Stage 01: Shared play-block messages and types

## Status
done

## Description

Single source of truth for delivery play-block reason codes and user-facing strings. Remove the duplicated map in `playbackStatus.js` that must stay in sync with `downloads/resolve.js`. Align typedefs for play-source / block-reason so player store and formatters do not redefine the same unions.

## Rationale

The thermo-nuclear review called out dual `MESSAGES` / `PLAY_BLOCK_MESSAGES` maps as a boundary leak that will drift. Deduping messages and types is pure and unblocks cleaner deep-dive reason rows and `playIndex` failure helpers without touching UI structure yet.

## Implementation

- Introduce one small shared module (e.g. `static/js/playBlock.js` or export from `downloads/resolve.js` if that stays the owner—prefer a tiny shared module if resolve should not own UI-facing presentation imports). Contents:
  - reason string map used today for missing / broken / no_id / offline_no_local / play_failed
  - JSDoc typedefs for play source state (`none` | `streaming` | `downloaded` | `unavailable`) and block reasons
- `downloads/resolve.js`: import/reuse the map instead of a private `MESSAGES` constant; keep `PlaySource.message` filled from that map.
- `playbackStatus.js`: import the same map for deep-dive Reason rows; delete the local copy and the “keep in sync” comment.
- `stores/player.js` and `playbackStatus.js`: import or re-export typedefs from the shared module rather than duplicating union strings.
- No UI behavior change. Smoke: blocked offline track still produces the same notice text and the same deep-dive Reason string.
