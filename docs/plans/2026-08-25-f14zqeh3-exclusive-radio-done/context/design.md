**Archive.** Decisions in this file were current as of 2026-08-25 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Exclusive radio and exclusive-lossy honesty

## Goal

When exclusive audio is enabled on the Mac PWA, household radio plays through the companion hog. Exclusive lossy playback stays the library file as stored (queue and radio), with honest status and no exclusive-FLAC prepare or missing-tech toast on those tracks.

## Settled decisions

- **Radio goes through the hog.** Tune-in does not call `release_device`. `MpvPlayer.stop` already keeps exclusive arming; today’s HTML radio while hogged is the gap (the browser element can be silent). This is the exclusive-radio TODO on `docs/systems/radio.md` / `exclusive-audio.md`.
- **Lossless exclusive radio uses the same exclusive FLAC tag as queue** (`getExclusiveProfileTag` + format mode). Not the household Streaming profile into mpv, and not lossless `source` (server 409).
- **Lossy exclusive stays AS IS.** Queue already streams `/api/stream?id=&codec=source` (or a companion locker file) into mpv. Radio exclusive does the same. No companion FLAC remux. `exclusive_lossy` only when a source URL cannot be built.
- **Household `tune_in` is unchanged.** Codec stays `browser_listed`. Server radio prepare union does not grow exclusive tags. Other tuners keep today’s complete-file work. This client `requestPrepare`s only the **current** exclusive tag when it will stream that tag. Upcoming ids stay unknown. Accept `tuning` while that encode finishes (same wait as a first HTML tuner on a new browser codec).
- **Enabled but not armed hard-fails.** No HTML fallback. Stay `tuning` and stubborn-rejoin. `exclusive_needs_device` toasts and opens Settings; `exclusive_readonly` toasts; `exclusive_not_ready` stays silent like other retryable radio failures. Never Tune out on exclusive load fail.
- **Downloads policy is the same as queue exclusive.** Companion locker URL into mpv when policy wins. Leftover OPFS `blob:` is not sent to mpv (stream instead).
- **Radio still does not import `player.ts` or call `resolvePlayIntent`.** Extract `exclusiveDelivery` for queue `exclusiveIntent` and radio `loadCurrent`.
- **Radio owns companion transport** via `companionClient`, not the queue `companionSink` instance. The idle queue sink must ignore companion events when `hasLoad` is false so radio time does not leak into the queue player.
- **Exclusive primary face applies to radio** once exclusive radio is real (`exclusive-audio.md` wins over the HTML-era “radio ignores exclusive snap”). Exclusive+lossy details list source-format rows (codec, bitrate, encoding, file rate), not **Profile: source**.
- **Exclusive-lossy honesty is in this plan:** skip exclusive prepare POST of `source`; do not missing-tech-toast lossy/source; status rows as above.
- **Hog stays armed** across Tune-out and session switch. Disable exclusive / controller loss still release.
- **Volume** still goes through `radioAudio.setVolume`; the companion backend maps it like the queue sink.
- **Radio `ended` never Tunes out.** Companion eof is listen-ended only.
- **Companion radio seek waits for duration**, then seeks to the clock. The queue sink’s “skip seek until duration is known” would leave radio at 0.

## Design

Queue exclusive already has a working play path: locker file, else lossless exclusive FLAC tag, else lossy `source`. Radio is a separate HTML element that joins the household clock. Exclusive radio is that same delivery into **this Mac’s** mpv, plus seek-to-clock.

```text
tune_in (browser Streaming codec) → household prepare (unchanged)
                 │
            loadCurrent
                 │
        exclusive enabled?
         /                \
       yes                 no
        │                  │
 exclusiveDelivery    resolvePlaySource
 locker | flac_* | source   (today)
        │                  │
 radioAudio companion     radioAudio HTML
 load → wait duration → seek(clock) → play
```

`exclusiveDelivery` is the shared URL/profile/block decision (no sink attachment). `resolvePlayIntent` stays the queue constructor that attaches `companion`. Radio `loadCurrent` calls `exclusiveDelivery` then `radioAudio.setBackend("companion")`.

Companion radio load must wait until mpv reports a duration (or the existing 8 s radio load timeout) before `seek(interpolatedPosition())`. `maybeReseek` must use `radioAudio.duration` / `currentTime`, not `radioAudio.el`.

Exclusive prepare for radio is `requestPrepare([current], exclusiveTag, { urgent: true })` only when delivery is lossless streaming of that tag. Do not `drop_pending_prewarm`. Do not POST `source`.

Session handoff is already correct for hog: `become("radio")` → `teardownOnDemandMedia` → companion `stop` (transport only). Radio then `load`s the same mpv. `become("queue")` → radio `leave` stops radio audio (companion `stop` again) and the queue sink `load`s.

## Stage map

1. **Exclusive-lossy honesty** — independent of radio. Stops the lying toast/prepare/details on the path that already plays `source`. Stage 05 reuses those detail rows.
2. **Extract `exclusiveDelivery`** — radio is forbidden from calling `resolvePlayIntent`. Queue intents stay identical. Stage 04 imports this helper.
3. **Radio companion audio** — `radioAudio` can load/seek/play/stop/volume on mpv with live getters. Session still HTML until 04. Mute the idle queue sink so both listeners can share `onCompanionEvent`.
4. **Exclusive radio load** — depends on 02 + 03. `loadCurrent` picks exclusive delivery, prepares the current exclusive tag, hard-fails when unarmed, re-resolves on exclusive toggle / format mode. This is the feature.
5. **Exclusive radio status** — depends on 04 (exclusive face while HTML would lie) and 01 (lossy source-format rows). Wire the snap into the radio room.
6. **Living docs** — rewrite the exclusive-radio TODO and leftover-OPFS contradiction after the code exists. `design.md` is not living documentation.

## Out of scope

- Windows / Linux hog
- Changing `tune_in` to accept exclusive tags or `source`
- Server radio prepare of exclusive tags for next-2
- Offline radio
- Gapless
- Leftover OPFS into mpv
- Lossless `source` passthrough
- Radio re-encode of lossy
- Teaching `resolvePlayIntent` about radio
- Vue / sink / mpv / ffmpeg / outbound-fetch tests
- Shrinking household `enqueue_prepare` because this tuner has a download or is exclusive

## Assumptions

- mpv can HTTP-load and seek library `/api/stream` exclusive FLAC (complete-file cache) and lossy `source` (passthrough `FileResponse`).
- Exclusive encode of the current track may delay first exclusive Tune-in or official advance the same way a first HTML tuner waits for a new browser codec.
- The companion socket is already the exclusive-enabled connection (same as queue exclusive).
- `createRadioAudio` keeps live getters (do not object-spread the radio object). The companion backend uses the same getter shape.
- Manual hog + clock check is on a Mac with `musicweb companion`; automated tests stay node unit tests.
