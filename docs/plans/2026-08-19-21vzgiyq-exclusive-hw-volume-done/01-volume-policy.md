# Stage 01: Volume policy

## Status
done

## Description

Add a pure companion module for exclusive volume policy: slider clamp, hardware-vs-digital plan, one-device tenure (snapshot once / restore or not), and an orchestrator with one `apply()` and injected I/O. No Core Audio, no mpv IPC, no `MpvPlayer` changes.

## Rationale

`docs/development/testing.md` forbids exercising Core Audio or mpv. Apply/restore rules (unity digital on hardware success, no re-snapshot, no invented restore, live id dies on release) have to live in a module pytest can import, or they only exist as comments in `mpv_player.py`.

## Invariants

- Defaults before the first apply: `user == 100.0`, `path == VOLUME_DIGITAL`.
- User volume is clamped to `[0, 100]`.
- `plan_volume(v, hardware_applied=True)` → `(v, 100.0, VOLUME_HARDWARE)`.
- `plan_volume(v, hardware_applied=False)` → `(v, v, VOLUME_DIGITAL)`.
- Tenure snapshots at most once per device id tenure. A `None` read still marks snapshotted (no retry, no invented value).
- `prepare(same_id)` does not read again and does not yield a restore.
- `prepare(new_id)` yields `Restore(old_id, saved)` only when the old tenure had a numeric snapshot; the live id becomes `new_id`; then reads once for the new tenure.
- `release()` yields a restore only when a numeric snapshot exists, then clears tenure. Live device id is `None`. Later `apply` does **not** call `set_hw`.
- One apply entrypoint (`apply`). No `after_armed` / `after_ao_ready`.
- `ExclusiveVolume.apply`: if a device id is live, call `set_hw(id, user)`; use that boolean in `plan_volume`; call `set_digital(digital)`; remember `path`. After `on_release`, skip `set_hw`.
- `on_device` / `on_release` only return a restore target. They do not call `set_hw`. The player writes restore after unhog (stage 03).
- The module does not import `mpv_player`, start a subprocess, or call Core Audio.

## Risks

- If `apply` still has a live id after `on_release`, a later `audio-reconfig` writes the user slider onto the unhogged device and undoes restore. Clearing the live id is required, not optional.

## Implementation

### Files

- Create: `src/musicweb/exclusive/volume.py`
- Create: `tests/test_exclusive_volume.py`

### Steps

1. Export `plan_volume(volume_0_100: float, *, hardware_applied: bool) -> tuple[float, float, str]` (user, digital, path) using `VOLUME_HARDWARE` / `VOLUME_DIGITAL`.
2. Export `Restore(device_id: str, volume: float)` and `VolumeTenure` with `prepare(device_id, *, read_volume) -> Restore | None` and `release() -> Restore | None`. `read_volume` is `(device_id) -> float | None`.
3. Export `ExclusiveVolume` constructed with `get_hw`, `set_hw`, `set_digital`:
   - `user`, `path` (slider and last path; not internal digital)
   - `set_user(v)` clamps, stores user, `apply()`
   - `on_device(device_id) -> Restore | None` = `tenure.prepare`
   - `on_release() -> Restore | None` = `tenure.release`
   - `apply()` as specified in Invariants
4. Tests (no macOS / no mpv):
   - defaults `user=100`, `path=digital` before first apply
   - `plan_volume` hardware vs digital, clamp below 0 and above 100
   - tenure: first prepare reads once; same id does not read; `None` read means release yields nothing; new id yields old restore when saved and live id is the new id; release yields, clears, and later `apply` does not call `set_hw`
   - `ExclusiveVolume`: hardware True → digital 100 + path hardware; hardware False → digital = user + path digital; `on_device` then `apply` calls `set_hw` with user volume; second apply after `set_hw` returns False switches path to digital

### Verify

```sh
uv run --group dev pytest tests/test_exclusive_volume.py
```

## Acceptance

- [ ] `plan_volume` matches Invariants for both paths and clamp.
- [ ] Defaults are user 100 / path digital.
- [ ] Tenure never re-reads, never invents a restore, and only yields a restore when a numeric snapshot exists.
- [ ] `on_release` clears the live id; a following `apply` does not call `set_hw`.
- [ ] `ExclusiveVolume` tests cover success, fail-open, and path flip on a later failed write.
- [ ] One `apply()` name; no armed/ao-ready aliases.
- [ ] The new module does not import `mpv_player` or call Core Audio.
