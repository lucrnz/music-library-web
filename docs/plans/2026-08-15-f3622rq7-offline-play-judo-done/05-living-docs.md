# Stage 05: Living docs

## Status
done

## Description

Record the snapshot gate, playlist-owned skip walker, and player module split on the systems / conventions pages.

## Rationale

027 docs still say skip lives in player transport. After this plan that is false.

## Invariants

- Exact method names beyond `canUseRemoteMedia` / `advanceToPlayable` / file paths can stay in source; docs state ownership.

## Risks

None

## Implementation

### Files

- Change `docs/systems/playback.md`
- Change `docs/systems/connectivity.md`
- Change `docs/frontend/conventions.md` (player store split)

### Steps

1. **playback.md:** cursor advance is `stepNext`/`stepPrev`; skip is `pl.advanceToPlayable` (clone + those steps). `playNext`/`playPrev` stay thin. Queue gray reads `connectivity.canUseRemote`. Point at `playlist.js`, `playerState.js`, `playerSession.js`, `playerPrefs.js` as owners.
2. **connectivity.md:** snapshot notify on state or confirmed; Vue `canUseRemote`; no fake state transition.
3. **conventions.md:** player store is a facade — state / session / prefs modules; loaders stay in `player.js`. Do not add a bundler.

### Verify

- `rg "advanceToPlayable|playerState|canUseRemote" docs/systems docs/frontend` — ownership mentioned.
- No link to this plan as living SOT.

## Acceptance

- [ ] playback.md no longer claims skip walks live in `player.js`.
- [ ] connectivity.md describes snapshot notify + Vue `canUseRemote`.
- [ ] conventions.md names the player split without making the plan directory SOT.
