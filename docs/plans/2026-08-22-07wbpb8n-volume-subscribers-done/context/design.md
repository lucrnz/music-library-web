**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Global output volume

## Goal

Make output volume one app-wide value: the on-demand slider, the radio slider, and both audio elements share `player.volume` and `musicweb.volume`. A change on either surface updates the face everywhere, restores from localStorage on boot, and applies to every subscribed sink — including after leaving `/radio`.

## Settled decisions

- Volume is global across on-demand and radio. One face (`player.volume`), one persistence key (`musicweb.volume` via `setOutputVolume`), both sliders already bind that face. This plan makes **apply** match that contract.
- `playerPrefs.ts` owns the single `watch` on `player.volume` and a subscriber registry. `initOutputVolume()` runs from `main.ts` **before** `createApp()`, so the watch is not owned by any component.
- Sinks subscribe: the on-demand path calls `getActiveSink().setVolume` (HTML or companion); radio calls `radioAudio.setVolume`. `player.ts` does not import `radio.ts`; `radio.ts` does not import `player.ts`.
- Subscribe applies the current volume immediately. `tuneIn` may still set `radioAudio` from `player.volume` once; that is not the live path.
- Radio’s other `connect()`-registered Vue watches (`settings.streamCodec`, `settings.playbackPolicy`, `connectivity.state`) die the same way today. Detach them in a later stage via `initRadioListeners()` from `main.ts` before `createApp()`. `bindVisibility` stays a `document` listener.
- No ADR. Living docs: `docs/systems/radio.md`, `docs/systems/playback.md`, `docs/frontend/conventions.md`.

## Design

`setOutputVolume` already writes the face and localStorage. Both `NowPlayingView` hosts already pass `:volume="player.volume"` and call that writer. The break is apply: radio registers `watch(() => player.volume, …)` from `RadioView` `onMounted` → `setTabOpen(true)` → `connect()` → `bindVolumeWatch()`. Vue 3.5 attaches that watch to RadioView’s effect scope. Leaving `/radio` unmounts the view (`v-if="onRadio"`), the scope stops, and `volumeBound` stays true so `connect()` never re-registers. The thumb still moves; `radioAudio.volume` stays at the last `tuneIn` apply.

On-demand works because `initAudioListeners()` runs in `main.ts` before `createApp()`, so its volume watch is detached.

Replace both volume watches with one owner:

```text
setOutputVolume(v)
        │
        ▼
  player.volume + localStorage
        │
        ▼
 initOutputVolume watch  (playerPrefs, boot, no component)
        │
        ├──────────────► queue / companion  getActiveSink().setVolume
        └──────────────► radioAudio.setVolume
```

`hydrateOutputVolume()` reads storage into `player.volume` at boot (today’s `applyVolume` hydrate half). Subscribers apply that value when they register.

Radio chrome, socket, and `connect()` stay as they are. Only watch registration moves off the RadioView lifecycle.

## Stage map

1. **Prefs registry + queue subscribe** — the watch must exist and own apply before radio can drop its copy. Queue keeps working without `player.ts` knowing about radio.
2. **Radio subscribe** — this is the reported slider bug. Depends on the registry and on `initRadioListeners()` being called from `main.ts` before `createApp()`.
3. **Detach remaining radio watches** — same `connect()` latch as volume. Safe after volume no longer lives in `bindVolumeWatch`.
4. **Living docs** — write against the code stages 01–03 actually shipped.

## Out of scope

- Merging radio and on-demand into one `HTMLAudioElement`
- Changing `NowPlayingView` slider chrome or `:volume` bindings
- Per-device or exclusive-only volume policy (companion still receives volume through `getActiveSink()`)
- Re-binding watches on every RadioView mount (does not fix the compact bar)
- A new persistence key or a second volume face

## Assumptions

- Happy-dom lets tests assign and read `HTMLAudioElement.volume`, matching existing radio audio tests that assign `currentTime`.
- `main.ts` may import `radio.ts` at boot. `PlayerBar` already imports it after mount; `player.ts` still must not.
- Radio tests stay free of `player.ts` imports. They may import `playerPrefs` and `playerState`.
- `load.ts` may keep `activeSink.setVolume(player.volume)` on load; that is a one-shot, not a second live watch.
