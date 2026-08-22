**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Honor download policy on radio

## Goal

When a listener is tuned in, radio plays a local download instead of `/api/stream` whenever **When a download exists** says the local file wins — same setting, same three meanings as queue play — and seeks that file to the household station clock. This is data-saving (4G), not offline radio.

## Settled decisions

- Radio uses `settings.playbackPolicy` with the existing three meanings, compared against the tuner Streaming profile (`source` when the official track is lossy). No radio-only control and no cellular detector.
- A download replaces audio bytes only. Tune-in still requires the WebSocket clock. An unreachable server cannot Tune in, even if the file is on the device.
- Household prepare is unchanged. `tune_in` still enqueues the official complete-file encode for other tuners. This client’s delivery choice is private.
- While the tuner socket is up, resolve treats the session as online. **Prefer live stream when online** still streams.
- If the winning local blob fails to open or play: `markTrackBroken` (same catalog mark as queue), then load `/api/stream` and stay on the clock.
- Changing the policy while chrome is `tuning` or `tuned` re-resolves the current track at the current official second. Changing Streaming still re-sends `tune_in`, then `loadCurrent` re-resolves. Chrome `stopped` / `inactive` does not reload.
- The tuned room status line is honest: **Downloaded · {local profile}** when bytes are local; **Streaming · {tuner profile}** when they are not. Lossy still uses the track’s source-format fields (`playProfileId` stays null). Compact and mini stay without a codec line.
- The three Settings hints each get one short clause that the policy applies to radio as well as queue play.

## Design

Radio is a shared station clock plus a per-device file. The clock, picker, and household encode stay on the server. This plan only changes how **this** tuner’s `HTMLAudioElement` gets its URL.

`frontend/src/radio/session.ts` `loadCurrent` today always calls `streamUrl`. After this plan it calls existing `resolvePlaySource` (delivery only — not queue `resolvePlayIntent`, which attaches a sink and exclusive). Context:

- `enabled`: `downloads.enabled`
- `offline`: `false` (socket is up)
- `activeStreamCodec`: today’s `streamCodecForLoad()` (`SOURCE_TAG` if `radio.isLossy`, else `tunerProfile` / Streaming)
- `playbackPolicy` / `catalog`: `settings.playbackPolicy` / `settings.options`

A `downloaded` URL is a complete OPFS blob (`URL.createObjectURL`); seek is `HTMLAudioElement.currentTime`, same as queue. After `load`, radio still `seek(interpolatedPosition())` then `play`. Generation (`radioGen`) still cancels overlapping loads.

Local-fail remint lives in `session.ts` and mirrors `playback/load.ts`: same `radioGen`, `markTrackBroken`, revoke the blob, skip `resolvePlaySource`, `streamUrl` + `streamCodecForLoad()`. Do not route radio through `resolvePlayIntent`.

`player.ts` must not import `radio.ts`. Radio watches `settings.playbackPolicy` itself (next to the existing `settings.streamCodec` watch) and exposes `onPlaybackPolicyChanged` the same way it exposes `onStreamProfileChanged`.

Store the last successful delivery on `radio` (`playSource`, `playProfileId`) so `radioPlayState()` can stop hardcoding `"streaming"`. Revoke the radio blob URL on remint, track change, Tune out, leave, and `resetRadioStore`.

If a local file’s `el.duration` is shorter than the official clock, `maybeReseek` must not spin-seek every tick: once the official position is at or past `el.duration`, skip reseek and wait for the station to advance.

```text
tune_in (codec = Streaming) → household prepare (unchanged)
                                    │
                             loadCurrent
                                    │
                         resolvePlaySource
                    offline:false  policy + tuner profile
                           ┌────────┴────────┐
                     downloaded            streaming
                     (OPFS blob)         (/api/stream)
                           │                 │
                     load → seek(clock) → play
                           │
                     blob play fails?
                           ▼
                  markTrackBroken + stream remint
```

## Stage map

1. **Delivery resolve** — `loadCurrent` is the only place radio fetches audio. Policy, remint, blob lifecycle, and the policy watch have to land here before any status line or docs can tell the truth.
2. **Status + Settings hints** — depends on stage 01 writing `radio.playSource` / `playProfileId`. User-visible honesty only; no second resolve path.
3. **Living docs** — rewrite the “radio is not stream-vs-download” sentences against the code stages 01–02 actually shipped. `design.md` is not living documentation.

## Out of scope

- Offline radio (Tune in or keep playing with no clock)
- Exclusive-mode radio
- Skipping or shrinking household `enqueue_prepare` because this tuner has a file
- A radio-only delivery setting or metered/cellular detection
- Radio listen stats
- Changing `resolvePlaySource` semantics for queue play
- Teaching `resolvePlayIntent` about radio
- Local cover-art resolve for radio
- Server protocol changes (`tune_in` stays `{type, codec}`)

## Assumptions

- Downloaded audio is a complete, seekable blob URL of the OPFS file, not MSE (already true).
- A transcode of the same track is close enough in duration to `tracks.duration_ms` that clock seek works; the `el.duration` clamp covers small error and a short file.
- A live tuner socket means `/api/stream` is available for remint.
- `downloads.enabled === false` already makes `resolvePlaySource` stream; radio inherits that.
- Queue still does not restart on policy change; radio does, because the listener cannot skip to the next official track.
