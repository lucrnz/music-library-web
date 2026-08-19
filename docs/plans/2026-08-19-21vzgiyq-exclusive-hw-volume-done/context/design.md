**Archive.** Decisions in this file were current as of 2026-08-19 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Exclusive hardware volume

## Goal

Exclusive hog playback at in-app slider 100% should be as loud as the same track in the browser. The companion must drive Core Audio analog gain when the device allows it, keep mpv at unity on that path so hog is not double-attenuated, and restore the pre-hog hardware volume when exclusive ends — including companion process stop.

## Settled decisions

- **Hardware-as-path when a write succeeds.** The in-app slider is the user volume (0–100). If a hardware volume write succeeds, mpv digital stays at 100 (unity) and status `volume_path` is `hardware`. If it fails, mpv digital is the slider value and `volume_path` is `digital`.
- **Symptom in scope.** Quiet exclusive vs browser at the same in-app 100%. Not a new PWA slider, not digital gain above 100%, not Media-key mapping.
- **What counts as success.** Try Virtual Main (`vmvc`), then master `VolumeScalar` (`volm`), then per-channel `volm`. For slider `> 0`, success is at least one scalar write **and** (unmute succeeded **or** no mute property). Mute-only does not count. For slider `0`, scalar write **or** mute write is enough. Unmute-only never counts.
- **Re-apply after hog.** mpv exclusive only hogs on AO init. Apply on `set_volume`; snapshot on `set_device`; apply after arm and after `load` / mpv `audio-reconfig`. Hardware failure never blocks play.
- **One teardown: unhog, then restore.** Same sequence for device change, `release_device`, and `close()` (companion lifespan / Ctrl+C). Drop exclusive (or kill mpv) first, then write the pre-hog snapshot if we have one. Same device again: do not drop, do not restore, do not re-read; re-apply after arm.
- **Snapshot once.** Read hardware volume once before the first write on that device tenure (`set_device`, before hog). A `None` read marks snapshotted: do not invent a restore, do not re-read later.
- **Live id dies on release.** After `on_release`, apply is digital-only and must not call `set_hw`. `audio-reconfig` after unhog must not write the user slider back onto the system device.
- **Each apply independently sets the path.** A later failed hardware write falls back to digital for that apply. Status stays honest. Rare double-attenuation is accepted.
- **Scope.** Companion (`src/musicweb/exclusive/`) plus the Volume section of `docs/systems/exclusive-audio.md`. No PWA UI. No protocol version bump (`volume_path` already exists).

## Design

Today exclusive volume is digital-only. `MpvPlayer` starts `--volume=100`, clamps `set_volume` to 0–100, and hardcodes `volume_path` to `digital`. `set_device_volume` exists but `_set_hardware_volume` always returns `False`.

mpv `--audio-exclusive` redirects to `coreaudio_exclusive`: hog, disable mixing, write the hardware stream. That backend has no `ao-volume`. The Mac mixer is bypassed, so analog gain often stays low and exclusive at slider 100% is much quieter than shared-mode browser playback.

**Policy module** (`exclusive/volume.py`) owns `plan_volume`, one-device tenure (snapshot once, restore or not), and a small `ExclusiveVolume`: clamp, tenure, one `apply()`, `set_user`, `on_device`, `on_release`. Injected get/set hardware and set-digital. `MpvPlayer` does not copy those rules. No `after_armed` / `after_ao_ready` aliases.

**Tenure / player order.** `on_device(new)` may yield a restore for the old id and makes the **new** id live (apply never targets the old id). The player then:

1. Unhog (`audio-exclusive=no`, `audio-device=auto`) when leaving a different live device, or on `release_device` / `close`
2. Write restore via `set_device_volume` if tenure returned a numeric snapshot
3. Arm the new id if switching or first select
4. `apply()`

Same id: skip 1–2; do not re-snapshot; `apply()` after arm. `close()`: unhog or quit mpv first (hog is gone either way), then restore, then tear down sockets/tmpdir.

**Apply.** If a live device id exists, `set_device_volume(id, user)`. `plan_volume` picks digital + path from that boolean. Set mpv `volume` to the digital value only when IPC is connected. Status reports the **user** slider (`ExclusiveVolume.user`) and the path — one field, no `_volume` alias of a different number.

**HAL.** Share one tiny bootstrap in `coreaudio.py` (`fourcc`, CoreAudio/CoreFoundation load, property address, get/set data). Do not copy the listing block into get/set; do not rewrite `_list_devices_coreaudio` merge. Resolve must read `kAudioDevicePropertyDeviceUID` (`uid `) — listing today never reads UID, and mpv ids are `coreaudio/<UID>`. Selector table and `hardware_set_succeeded` are pure and tested with fake property I/O.

**Protocol.** No new message types. `volume` in status remains 0–100 user volume. `volume_path` becomes honest (`hardware` | `digital`).

## Stage map

Policy is independent of ctypes and is the only apply/restore logic the test harness can run (tests must not start mpv or talk to Core Audio). Hardware I/O is a separate stage so get/set can land and fail open before the player trusts them; its acceptance is the fake-I/O seam, not “selectors match.” Player wiring is last among code stages because hog timing and teardown order only exist there. Living docs last so the Volume section describes shipped behavior.

1. **Volume policy** — `plan_volume`, tenure, `ExclusiveVolume` + unit tests.
2. **Core Audio hardware volume** — shared HAL bootstrap, UID resolve, selector table, fake-I/O tests. No player wiring.
3. **Companion apply/restore** — `MpvPlayer` unhog-then-restore, `close()`, honest `volume_path`, player-order tests.
4. **Living docs** — Volume section on the exclusive-audio page.

## Out of scope

- PWA UI, now-playing copy, or a second volume slider
- Protocol v2 or new WebSocket fields
- Digital gain above 100% / `--volume-max`
- Mapping Mac volume keys or Media Session volume
- Bit-perfect “digital always 100% even when hardware fails”
- Windows / Linux companions
- Changing hog / exclusive arming rules
- Auto-pick of a default output device
- Restore after SIGKILL / crash that never runs `close()`

## Assumptions

- Built-in speakers and most USB DACs expose at least one settable volume property after hog; some devices will stay digital-only and remain quiet relative to the browser — that is accepted fail-open, not a blocker.
- Snapshot on `set_device` (idle mpv, exclusive armed in process but AO not necessarily hogging yet) still sees the user’s current system volume.
- `audio-reconfig` is a default mpv **event** (not `observe_property`); it fires when exclusive AO comes up; re-apply there is enough without a timed retry loop.
- Leaving hardware unrestored when the snapshot read failed is better than restoring a guessed or post-hog value.
- Uvicorn lifespan / SIGTERM on the companion hits `MpvPlayer.close()`. SIGKILL does not.
- `FakePlayer` in hub tests may keep a hardcoded `volume_path: digital`.
