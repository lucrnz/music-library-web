# Stage 01: Rail occupant state

## Status
done

## Description

Add a persisted now-playing rail occupant (`queue` | `radio`) next to `player.expanded`, with writers `openRadioRail`, `toggleRadioRail`, and `openQueueRail`. Hydrate restores a radio rail even when the queue is empty. No Vue chrome yet.

## Rationale

Shell, compact-bar cover, and the Queue Radio icon must share one occupant API. If each host writes `expanded` by hand, persist and empty-queue hydrate will fork.

## Invariants

- `playerPrefs` does not import `player.ts` or `radio.ts`.
- `setOutputVolume` remains the only writer of `player.volume` / `musicweb.volume`.
- `setExpanded(false)` collapses the rail/sheet and still persists expanded; it does not reset `railFace`.
- `applyExpanded` restores `expanded && railFace === "radio"` even when `pl.length === 0`. Queue face still requires `pl.length > 0`.
- `toggleRadioRail` collapses when the radio rail is already open; otherwise it opens the radio rail.

## Risks

- Reusing `musicweb.nowPlayingExpanded.v1` for occupant would make old `"1"` ambiguous. Use a second key.
- Calling `setExpanded(true)` without setting `railFace` would reopen whichever face was last persisted. Queue expand must go through `openQueueRail`.

## Implementation

### Files

- `frontend/src/stores/playerState.ts`
- `frontend/src/stores/playerPrefs.ts`
- `frontend/tests/stores/playerPrefs.test.ts`

### Steps

1. In `frontend/src/stores/playerState.ts`, add `railFace: "queue" | "radio"` to `PlayerState` (default `"queue"`). Export that union as `NowPlayingRail`. Comment that it chooses desktop-rail / mobile-sheet contents; mobile `/radio` still ignores it.
2. In `frontend/src/stores/playerPrefs.ts`, persist `railFace` under `musicweb.nowPlayingRail.v1` (`"queue"` | `"radio"`). Add `setRailFace`, `openQueueRail` (`expanded` true, face `queue`), `openRadioRail` (`expanded` true, face `radio`), and `toggleRadioRail` (if `expanded && railFace === "radio"` then `setExpanded(false)`, else `openRadioRail`). `setExpanded` keeps writing `musicweb.nowPlayingExpanded.v1` and does not change `railFace`. `applyExpanded` reads both keys and applies the hydrate rule in Invariants. Do not import `player.ts` or `radio.ts`.
3. In `frontend/tests/stores/playerPrefs.test.ts`, add cases that: (a) `openRadioRail` sets `expanded` and `railFace === "radio"` and writes both storage keys with an empty playlist; (b) `applyExpanded` after reload with those keys restores the radio rail when `pl.length === 0`; (c) `applyExpanded` with expanded stored and `railFace === "queue"` stays collapsed when the playlist is empty; (d) `toggleRadioRail` opens then collapses without clearing `railFace`; (e) `openQueueRail` then `setExpanded(false)` leaves `railFace === "queue"`. Reset `player.expanded`, `player.railFace`, playlist, and both storage keys in `beforeEach`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/stores/playerPrefs.test.ts
pnpm --dir frontend typecheck
```

No UI change to click. Existing now-playing expand/collapse still uses `setExpanded` until stage 02 switches queue expand to `openQueueRail`.

## Acceptance

- `frontend/tests/stores/playerPrefs.test.ts` proves radio-face hydrate with an empty queue, queue-face empty-queue collapse, toggle, and `setExpanded(false)` preserving face.
- `frontend/src/stores/playerPrefs.ts` still does not import `player.ts` or `radio.ts`.
- `pnpm --dir frontend typecheck` passes.
