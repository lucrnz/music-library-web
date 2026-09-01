# Stage 03: Document queue join in living docs

## Status
done

## Description

Write the shared clocks and on-demand join rules into `docs/systems/playback.md`, retarget radio’s source-of-truth paths, and list `queueJoin.ts` in frontend conventions. This plan directory is not the living doc.

## Rationale

Stage 02 changes product rules (when a queue load is committed, what retries, what is a hard block). Those rules must live next to the other playback invariants or the next change will treat `play()` as success again.

## Invariants

- Docs describe intent and ownership. Exact argv, HTTP shapes, and timer values stay in source; the 8 s / 1 s…8 s numbers may be named as matching `JOIN_HOLD_MS` / rejoin constants.
- Radio’s pause-during-hold rule is unchanged in `radio.md` except for the new module paths.

## Risks

- Updating radio paths but leaving `radio/hold.ts` / `radio/rejoin.ts` in the source-of-truth list.

## Implementation

### Files

- `docs/systems/playback.md`
- `docs/systems/radio.md`
- `docs/frontend/conventions.md`

### Steps

1. In `docs/systems/playback.md` Source of truth, add `frontend/src/playback/queueJoin.ts` (queue hold / rejoin / hard-block set), `frontend/src/playback/joinHold.ts`, `frontend/src/playback/rejoinClock.ts`, and `frontend/src/playback/joinTimeout.ts`. Keep `player.ts` as transport owner and `load.ts` as load/fail owner.
2. In the same file, document the queue join: `play()` / sink `load` resolving is not a committed start; HTML waits `canplay` and companion waits first duration, both capped at the shared load timeout; an 8 s hold starts only after a real play when the user did not ask to pause; unintentional pause, retryable error, soft reject, load timeout, and early `ended` stay on the row and retry forever from last heard position with silent loading chrome; intentional pause (in-app, lock-screen, Media Session) cancels the loop; natural `ended` advances; hard blocks still `failCurrentLoad`; connectivity recovery kicks an unfinished retryable join; CD is not on this loop.
3. In `docs/systems/radio.md` Client / Source of truth, replace `radio/rejoin.ts` and `radio/hold.ts` with the `playback/joinHold.ts` / `playback/rejoinClock.ts` / `playback/joinTimeout.ts` paths. Keep radio-owned wiring (`session.ts`, `stores/radio.ts`, `audio.ts`) as the radio face. Do not change Tune-out / pause-during-hold product text except to say radio still treats any pause during the hold as a failed join (queue’s intentional-pause exception does not apply).
4. In `docs/frontend/conventions.md` architecture paragraph, name `queueJoin.ts` as the on-demand join owner and the shared `joinHold` / `rejoinClock` modules. Repeat that `player.ts` does not import `radio.ts`.

### Verify

- `rg "radio/hold|radio/rejoin" docs/systems docs/frontend` is empty.
- `rg "queueJoin" docs/systems/playback.md docs/frontend/conventions.md` finds the new owners.
- Read the new playback paragraph against [Settled decisions](context/design.md): every settled rule appears once in living docs.

## Acceptance

- A reader of `playback.md` can state when a queue start is committed, what retries, and what fails once, without opening this plan directory.
- Radio docs point at the shared clocks and still forbid Tune-out on pause during the radio hold.
- Conventions list the new modules in the playback ownership map.
