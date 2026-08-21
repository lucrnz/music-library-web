# Stage 04: status session

## Status
done

## Description

`PlayStatusState` gains a required `session: "none" | "queue" | "radio"`. Formatters ignore `exclusiveSnap` when `session === "radio"`. Delete `RADIO_EXCLUSIVE_SNAP`. `PlaybackStatusLine` uses `useDesktopViewport`.

## Rationale

The dummy snap exists because the face is exclusive-first. Session on the play-state object makes radio unable to be relabeled Exclusive. That is the status judo. Do not merge the two HTML audio elements to get there.

## Invariants

- `playSource` stays `streaming` / `downloaded` / `unavailable` / `none`. Do not add `playSource: "radio"`.
- Radio audio stays `createRadioAudio`. Exclusive radio stays out.
- When `session === "queue"` (or `"none"`), exclusive snap still wins if `exclusiveSnap.enabled` — on-demand exclusive badge is unchanged.

## Risks

- A test fixture that builds `PlayStatusState` without `session` will fail typecheck. Default fixtures to `"queue"` unless the case is radio.

## Implementation

### Files

- frontend/src/playbackStatus.ts
- frontend/src/stores/radio.ts
- frontend/src/components/player/NowPlayingFull.vue
- frontend/src/components/radio/RadioNowPlaying.vue
- frontend/src/components/player/PlaybackStatusLine.vue
- frontend/tests/playback/playbackStatus.test.ts
- frontend/tests/stores/radio.test.ts

### Steps

1. Add required `session: "none" | "queue" | "radio"` to `PlayStatusState` in `frontend/src/playbackStatus.ts`. In `formatPrimaryStatus` and `buildPlaybackDetailsRows`, if `state.session === "radio"`, skip the exclusive-snap branch (treat as exclusive off). `formatStatusAriaLabel` follows `formatPrimaryStatus`.
2. `radioPlayState()` sets `session: "radio"`. Delete `RADIO_EXCLUSIVE_SNAP` and its `ExclusiveFaceSnapshot` import if unused.
3. `NowPlayingFull.vue` sets `session: "queue"` on its `playState`. `RadioNowPlaying.vue` passes `:exclusive-snap="null"` (or omits if the prop is already `null`able).
4. `PlaybackStatusLine.vue`: delete the local `DESKTOP_BREAKPOINT` string and `desktopMql` wiring; use `useDesktopViewport()` from `@/layout`.
5. Update `frontend/tests/playback/playbackStatus.test.ts` fixtures to set `session`. Add a case: `session: "radio"` plus an enabled exclusive snap still formats as streaming/codec, not Exclusive. Update `frontend/tests/stores/radio.test.ts`: `radioPlayState().session === "radio"`; drop `RADIO_EXCLUSIVE_SNAP` assertions.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test tests/playback/playbackStatus.test.ts tests/stores/radio.test.ts`

## Acceptance

- `RADIO_EXCLUSIVE_SNAP` does not exist. `rg RADIO_EXCLUSIVE_SNAP frontend/src frontend/tests` is empty.
- `PlayStatusState.session` is required. `formatPrimaryStatus` with `session: "radio"` and `exclusiveSnap.enabled === true` does not return the exclusive face.
- `PlaybackStatusLine.vue` imports `useDesktopViewport` from `@/layout` and does not contain `(min-width: 900px)`.
- `pnpm --dir frontend typecheck` exits 0. The Verify test list exits 0.
