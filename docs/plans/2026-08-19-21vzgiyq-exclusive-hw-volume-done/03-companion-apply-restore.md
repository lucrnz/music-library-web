# Stage 03: Companion apply/restore

## Status
done

## Description

Wire `MpvPlayer` to `ExclusiveVolume` and Core Audio get/set: one unhog-then-restore sequence for device change, `release_device`, and `close()`; apply after hog-related events only while a live device is intended; honest `volume_path`.

## Rationale

Quiet hog is a player-lifecycle bug: analog writes before AO init miss the path that actually plays. Restore written while still hogged misses the system slider. Process stop today is `close()`, not `release_device` — without a hook, quitting the companion leaves analog at the exclusive slider (often 100%).

## Invariants

- User-facing `volume` / `volume` property / `status_snapshot` read `ExclusiveVolume.user`. No `_volume` alias of a different number. Default path `digital` until the first apply.
- `volume_path` is the last apply (`hardware` | `digital`).
- **One teardown order** (device change to a different id, `release_device`, `close`): unhog first (`audio-exclusive=no` + `audio-device=auto`, or quit mpv on `close` if IPC is already dead) → write restore if tenure returned a numeric snapshot → then arm the new id (device change only) or finish teardown. Restore after hog is gone, never before.
- `set_device` same id: do not unhog, do not restore, do not re-snapshot; `apply()` after arm.
- `set_device` different / first id: `on_device(new)` (yields restore for old; live id is already `new`) → unhog if leaving a previous device → restore old → arm new → `apply()`.
- `set_volume`: `set_user` only. No live device → digital path.
- `load`: existing loadfile/unpause, then `apply()`.
- `_handle_ipc_message` on `audio-reconfig`: under the player `RLock`, `apply()` only when tenure still has a live id **and** `_device` is set (exclusive still intended). Otherwise no-op. Swallow apply/IPC errors; do not wait on the reader.
- `release_device`: stop transport → unhog → `on_release` → restore if any → clear `_device`.
- `close()`: if a numeric snapshot exists, unhog if IPC is up (or terminate mpv so hog is gone), then `set_device_volume(old, saved)`, then existing socket/process/tmpdir teardown. Hardware/restore failure does not skip teardown.
- Hardware or restore failure never fails `set_device` / `load` / `release_device` / `close`. Digital set runs when IPC is up; digital callback no-ops IPC when `_sock is None` but still updates user/path.
- Do not make `_command_unlocked` a production no-op when disconnected.
- `ExclusiveHub` / protocol messages unchanged. `FakePlayer` may keep a hardcoded digital snapshot.
- Do not start mpv (`Popen`) or open HAL in tests.

## Risks

- `audio-reconfig` after `audio-device=auto` will fire while the reader can take the lock. If the live id is not cleared, `apply` writes user volume (often 100) onto the system device and undoes restore.
- `_command_unlocked` raises when `_sock is None`. Tests must patch it; production must not grow a silent no-op except the digital callback already specified.

## Implementation

### Files

- Change: `src/musicweb/exclusive/mpv_player.py`
- Change: `tests/test_exclusive_volume.py` (add player-order tests in this file or `tests/test_exclusive_mpv_volume.py` — one place, not a third)

### Steps

1. Construct `ExclusiveVolume(get_hw=get_device_volume, set_hw=set_device_volume, set_digital=…)`. Digital callback sends `set_property volume` only when IPC is connected.
2. `status_snapshot` / volume property read `ExclusiveVolume.user` and `.path`. Delete a separate `_volume` store.
3. Hook `set_device`, `set_volume`, `load`, `audio-reconfig`, `release_device`, and `close` per Invariants. Snapshot only in `on_device` (`get_device_volume`), never in `apply`.
4. Tests: construct `MpvPlayer` **without** `start()` / `Popen`. Monkeypatch `_command_unlocked` to record argv (no raise). Monkeypatch `get_device_volume` / `set_device_volume`.
   - `set_device` + `set_volume(80)` + `set_hw` True → digital callback 100, path hardware, `set_hw(..., 80)`
   - `set_hw` False → digital callback 80, path digital
   - `set_device(A)` then `release_device`: recorded commands include exclusive off **before** `set_hw(A, snapshot)`
   - `set_device(A)` then `set_device(B)`: exclusive off → restore A → arm B → snapshot B only once
   - `get_hw` None → no restore write
   - `audio-reconfig` while armed → `set_hw` with current user
   - `audio-reconfig` after `release_device` → no `set_hw` with the user volume
   - `on_device` + `close()` issues the restore write after hog is gone
   - `tests/test_exclusive_hub_release.py` still passes

### Verify

```sh
uv run --group dev pytest tests/test_exclusive_volume.py tests/test_exclusive_coreaudio_volume.py tests/test_exclusive_hub_release.py tests/test_exclusive_mpv_volume.py
```

If player-order tests live in `test_exclusive_volume.py`, drop the `test_exclusive_mpv_volume.py` path from that command.

## Acceptance

- [ ] Unhog-then-restore is the only teardown order (device change, release, close).
- [ ] Status volume is the slider; `volume_path` is honest per apply; no `_volume` alias.
- [ ] Post-release `audio-reconfig` does not write user volume to hardware.
- [ ] `close()` restores when a snapshot exists.
- [ ] Player-order tests use `MpvPlayer` without `start()` and record `_command_unlocked`.
- [ ] Hub release tests still pass; no test starts mpv or opens HAL.
