# Stage 02: Core Audio hardware volume

## Status
done

## Description

Replace the `_set_hardware_volume` stub with real fail-open get/set: shared HAL bootstrap (not a second ctypes copy), UID resolve, a pure selector table and success predicate, tested through fake property I/O. `list_output_devices` merge stays as-is. `MpvPlayer` is not wired yet.

## Rationale

Policy from stage 01 cannot raise analog gain until get/set talk to HAL. The listing module already owns ctypes bootstrap and does **not** read UID; get/set cannot “just use listing fields.” A copied HAL plus untested selectors would go green and still no-op on `coreaudio/<UID>` ids.

## Invariants

- `set_device_volume` / `get_device_volume` never raise to callers. Non-mac, resolve miss, unsettable property, or OSError → `False` / `None`.
- One shared HAL bootstrap in this file: `fourcc`, CoreAudio/CoreFoundation load, `AudioObjectPropertyAddress`, get/set property data. Listing may call it. Get/set must not duplicate the loader or the listing `get_data` block. Do not rewrite `_list_devices_coreaudio` merge / name matching.
- Pure selector table `VOLUME_SELECTORS` (typed rows, not stringly fourccs inlined in the set loop), in order:
  - Virtual Main `vmvc` output element 0, then global element 0
  - master `volm` output element 0
  - `volm` output elements 1–8
- Get uses the same table and returns the first readable value as 0–100.
- Pure `hardware_set_succeeded(scalar_ok, mute_ok, *, mute_present, volume) -> bool`:
  - `volume > 0`: True iff `scalar_ok` and (`mute_ok` or not `mute_present`)
  - `volume == 0`: True iff `scalar_ok` or `mute_ok`
  - unmute-only (`scalar_ok` False) is always False
- Set still tries remaining selectors after the first scalar success so Virtual Main and channels stay in sync. Unmute when `volume > 0`; mute when `volume == 0`.
- Resolve: `coreaudio_device_key` strips a case-insensitive `coreaudio/` prefix. `match_device_key` against **UID** (`kAudioDevicePropertyDeviceUID`, fourcc `uid `), then numeric `AudioDeviceID` only if that id has output streams, then case-insensitive name. Empty key is False. No match → fail open.
- Do not hog, do not change exclusive/mixing.
- Tests must not call live `AudioObjectSetPropertyData` / real Core Audio.

## Risks

- Virtual Main can report settable and still not move hog analog gain; per-channel scalars are why the table continues after first success. If every write no-ops, exclusive stays quiet — fail open, digital path in stage 03.
- Sharing the bootstrap without touching listing merge is required. A “self-contained get/set ctypes path” is out: it would miss UID and fail open forever on mpv ids.

## Implementation

### Files

- Change: `src/musicweb/exclusive/coreaudio.py`
- Create: `tests/test_exclusive_coreaudio_volume.py`

### Steps

1. Extract the shared HAL bootstrap. Point listing property reads at it only where that is a mechanical swap; do not change merge behavior or advertised caps.
2. Export `coreaudio_device_key`, `match_device_key`, `VOLUME_SELECTORS`, `hardware_set_succeeded`, and public `get_device_volume` beside the existing `set_device_volume` wrapper.
3. Implement resolve: enumerate output devices, read UID via `uid `, name, output-stream presence; `match_device_key`. Digit-only keys may be an `AudioDeviceID` if that object has output streams.
4. Implement `_set_hardware_volume` / `_get_hardware_volume` as thin loops over `VOLUME_SELECTORS` plus mute (`mute` / `vmmc` best-effort) feeding `hardware_set_succeeded`. Property get/set go through the shared bootstrap **or** an injected property I/O used by tests.
5. Tests (fake property I/O: in-memory dict keyed by selector/scope/element — never live HAL):
   - `coreaudio_device_key` strips `coreaudio/` only
   - `match_device_key`: UID (`coreaudio/BuiltInSpeakerDevice` → `BuiltInSpeakerDevice`), numeric id, name (case), empty requested is False
   - `hardware_set_succeeded`: scalar+unmute; scalar+mute-absent; scalar+unmute-fail → False when mute present; unmute-only False; mute-only at 0 True; mute-only at 80 False
   - fake I/O set: selector order, remaining selectors after first success, unmute-not-enough-without-scalar
   - fake I/O get: first readable selector wins, clamped `[0, 100]`
   - monkeypatch `is_macos` False → set False, get None
   - monkeypatch inner get/set to raise → wrappers return False / None

### Verify

```sh
uv run --group dev pytest tests/test_exclusive_volume.py tests/test_exclusive_coreaudio_volume.py
```

## Acceptance

- [ ] Stub is gone; get/set fail open and never raise.
- [ ] One HAL bootstrap; listing merge unchanged; no second ctypes copy.
- [ ] UID fourcc is `uid `; `coreaudio/<UID>` matches.
- [ ] Fake-I/O tests assert selector order, continue-after-success, and `hardware_set_succeeded` cases in Invariants.
- [ ] No test talks to a real audio device.
