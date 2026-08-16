# Stage 05: Unify play-source vocabulary (face states)

## Status
done

## Description

Canonical delivery vocabulary end-to-end (**face states**):

- `none` | `downloaded` | `streaming` | `unavailable`

- `resolvePlaySource` returns `type: 'downloaded' | 'streaming' | 'unavailable'` (drop `local` / `remote`).
- Delete or trivialise `applyResolvedSource` mapping glue in `player.js`.
- Align JSDoc in `playBlock.js`, `resolve.js`, `playbackStatus.js`, player store.
- Formatters keep user-facing words only; no second machine enum.
- Update every switch on `local` / `remote`.

## Rationale

Parallel enums force translation at every boundary. One vocabulary makes resolve, player, and status the same model and simplifies stage 07’s linear play pipeline.

## Implementation

1. Grep for `local`, `remote`, `ResolvePlayType`, `applyResolvedSource`.
2. Change resolve return shapes; simplify player branches.
3. Smoke: stream play, downloaded play under policies, offline missing → unavailable copy, broken local → stream fallback still sets `streaming` when online.
