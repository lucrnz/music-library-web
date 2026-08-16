# Stage 01: MpvPlayer exclusive release sequence

## Status
done

## Description

Make exclusive mode a **runtime property tied to a selected device**, not a process-wide startup flag. Add a release path that stops playback and tears down Core Audio exclusive hold while keeping idle mpv. `set_device` is the only place that turns exclusive on.

## Rationale

`stop()` only clears transport. Leaving exclusive engaged with a selected (or default) device can leave headphones locked with no audio. Starting mpv with `--audio-exclusive=yes` also means the companion can hog before any controller exists. Exclusive audio is the product goal **when a controller has selected a device**; until then the process must not hold the device. Mac verification that another app can use the headphones is the done gate (stage 05).

## Implementation

- In `src/musicweb/exclusive/mpv_player.py`:
  - **Startup argv:** **omit** `--audio-exclusive=yes` (do not pass exclusive on at process start). Idle mpv starts non-exclusive with no preferred device.
  - **Shared transport clear:** factor the body of `stop()` (mpv `stop`, clear `_url` / position / duration, `_paused = True`) so `stop` and release do not drift.
  - **`release_device()`** (name flexible), under the existing lock:
    1. Clear transport (same as `stop`).
    2. Set mpv `audio-exclusive` to `no` / false.
    3. Set `audio-device` to `auto` (or mpv’s default “no preferred device” value).
    4. Clear internal `_device` to `None`.
    5. Idempotent: safe if already released (always set the properties; no soft skip required).
  - **`set_device(mpv_device)`:** set `audio-exclusive` to `yes` **and** `audio-device` to that device. This is the **only** arming path for exclusive. Do not leave exclusive off after a successful select.
  - **`stop()`:** transport only; **keep** selected device and exclusive-on if already on (controller still owns hog while connected).
  - **`close()`:** unchanged process teardown for companion lifespan.
  - One info log after the release sequence is issued (“exclusive device released”) — stage 05 still proves OS-level free.
- No hub, client, or test changes in this stage.
- Do not treat “set auto only under exclusive=yes” as sufficient. Do not reintroduce a process-level exclusive flag.
