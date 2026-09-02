# Stage 03: Living companion mpv docs

## Status
done

## Description

Update the systems pages that still say the companion starts idle mpv and keeps it after `release_device`, so the lazy process lifetime lives in normal docs rather than this plan directory.

## Rationale

`docs/README.md` treats plan trees as non-living. Exclusive/CD operators and agents will keep reading “starts idle mpv” unless those pages change after the hub actually quits the child.

## Invariants

- macOS/Windows still require the mpv **binary** at companion launch; Linux hog stays a stub.
- Hog arming, 60s TTL length, controller lock, and optical watch lifetime are not redescribed as new product rules — only the process lifetime around them changes.
- No new ADR. No protocol version bump.

## Risks

- Updating `cd-playback.md` watch text in a way that implies `release_device` now tears down watch (it must not).

## Implementation

### Files

- `docs/systems/exclusive-audio.md`
- `docs/systems/companion.md`
- `docs/systems/cd-playback.md`
- `docs/development/commands.md`

### Steps

1. In `docs/systems/exclusive-audio.md` architecture step 3, replace “starts idle mpv without process-level `--audio-exclusive`” with: companion starts with no mpv child; `set_device` / `load` spawn mpv without a process-level `--audio-exclusive`; first `list_devices` (not boot) lists Core Audio ∩ mpv / WASAPI ∩ mpv. In the TTL / `release_device` bullets, say the child is quit when nothing is loaded and no device is selected (TTL still unhogs; reclaim `set_device` respawns). Mid-play exclusive toggle may respawn. Do not add client/protocol steps.
2. In `docs/systems/companion.md` behavior, keep “mpv is required on macOS and Windows”. Add that the companion does not launch mpv (including `--audio-device=help`) until `set_device`, `load`, or `list_devices`.
3. In `docs/systems/cd-playback.md` Watch section, keep “`release_device` only unhogs” for watch/reader lifetime. Add that exclusive-off CD `load` starts mpv and leave/`stop` with no hog device quits it; watch is independent of the child.
4. In `docs/development/commands.md` Desktop companion section, keep the launch-time binary requirement. Note that the process is not started until hog or CD `load` (device list may run a short-lived `--audio-device=help`).

### Verify

- `rg -n "starts idle|keeps idle mpv|idle process stays" docs/systems/exclusive-audio.md docs/systems/companion.md docs/systems/cd-playback.md docs/development/commands.md` is empty.
- `rg -n "set_device|load" docs/systems/exclusive-audio.md docs/systems/companion.md` still describes spawn/quit in prose (not a file listing).

## Acceptance

- Living docs match stage 02: no idle child at boot, spawn on `set_device`/`load`, immediate quit when idle, watch ≠ mpv, binary still required on macOS/Windows.
- This plan directory is not cited as the long-term source of truth.
