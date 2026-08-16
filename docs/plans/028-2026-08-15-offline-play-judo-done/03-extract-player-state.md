# Stage 03: Extract playerState

## Status
done

## Description

Move the reactive `player` object and the play-source writers into `stores/playerState.js` so later modules can import state without cycling through the load/transport file.

## Rationale

Session/prefs extract is one-way only if they do not import `player.js` while `player.js` imports them. The reactive record is the seam.

## Invariants

- Play-source triple stays atomic (`setPlaySourceState` / `clearPlaySourceState` / `failPlayback` writers stay next to the record).
- `player.js` re-exports **`player` only**. It does not become a barrel of other session/prefs APIs.
- No behavior change. No skip/session moves yet.

## Risks

- A circular import if `playerState.js` pulls playlist or sinks. It must not. Covers stay as fields on the record; resolvers stay elsewhere.

## Implementation

### Files

- Create `src/musicweb/static/js/stores/playerState.js`
- Change `src/musicweb/static/js/stores/player.js`

### Steps

1. New file: `export const player` (same fields), `setPlaySourceState`, `clearPlaySourceState`, `failPlayback` / `setPlayNotice` if they only touch `player` (not sinks). `PLACEHOLDER_COVER` default covers stay. Do **not** import `playlist.js`, sinks, or connectivity.
2. `player.js` imports those symbols and `export { player }` (facade). Internal `player.` reads in `player.js` use the imported binding.
3. Leave `updateMediaSession`, volume, expanded in `player.js` this stage.

### Verify

- `rg "export const player" src/musicweb/static/js/stores` — only `playerState.js`.
- `rg "from \"./playerState.js\"" src/musicweb/static/js/stores/player.js` — player.js imports state.
- App still mounts; play still sets `playSource` atomically (play a track, inspect).

## Acceptance

- [ ] `player` record lives in `playerState.js` with no playlist/sink imports.
- [ ] `player.js` re-exports `player`; no component import churn required this stage.
- [ ] Load/stop behavior unchanged.
