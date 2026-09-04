# Stage 01: Companion volume and jailed listing

## Status
done

## Description

When Darwin classifies a disc as `kind: "data"`, resolve the macOS mount, walk allowlisted audio + folders, and expose a jailed directory listing over the companion protocol. After that first classify, watch polls mount presence instead of TOC-opening the raw device.

## Rationale

Every later stage needs a stable volume jail and a tree. Today `kind: "data"` is only a present-but-unplayable flag with no path.

## Invariants

- Host volume paths and `volume_id` never appear in WebSocket payloads. The client sees `volume_name` and relative POSIX paths only.
- After a data classify, the watch tick must not `cdio_open` / `port.read()` the device solely to refresh TOC.
- Classify can precede `/Volumes`. Present immediately with an empty listing (not “no disc”). Retry mount resolve on every watch tick until unmount. 30s is a still-resolving log/test window, not a give-up.
- A vanished mount is `present=false`, `kind="none"`. A changed `volume_id` at the same path is a new disc (clear index, new `optical_media` + `cdrom_index`).
- `media_signature` includes `volume_id` (None while pending) so pending→mounted and same-label swaps broadcast. Today every data disc is `(present, "data", None, None)`.
- Stub / non-Darwin ports still list no drives and have no volume.
- Allowlist and hidden-name rules match [context/disc-files.md](context/disc-files.md). Import `mp4_kind`; do not copy the ALAC/AAC probe.
- `jail_join` rejects the same class of paths as `blob_store.safe_key` / `Library.resolve`: empty, NUL, absolute, drive letter, any `""` / `"."` / `".."` part, resolved path not under the volume root.
- `auto_add_rel` is the single directory that contains every playable file, or `null`.

## Risks

- TOC-opening a mounted Yellow Book disc every second can stall the tray or unmount the volume.
- `diskutil` / IORegistry mapping from `/dev/rdiskN` to `/Volumes/…` is the usual failure point on SuperDrive + hybrid layouts.

## Implementation

### Files

- `src/musicweb/exclusive/optical.py`
- `src/musicweb/exclusive/optical_session.py`
- `src/musicweb/exclusive/optical_volume.py`
- `src/musicweb/exclusive/optical_fs.py`
- `src/musicweb/exclusive/protocol.py`
- `src/musicweb/exclusive/session.py`
- `tests/exclusive/test_optical.py`
- `tests/exclusive/test_optical_fs.py`
- `tests/exclusive/test_optical_volume.py`
- `frontend/src/exclusive/protocol.ts`
- `frontend/tests/exclusive/protocol.test.ts`

### Steps

1. Add `src/musicweb/exclusive/optical_volume.py` with `resolve_darwin_mount(device_id) -> VolumeMount | None` (`name`, local path, `volume_id`). `volume_id` is diskutil VolumeUUID or the BSD disk behind the mount — not the volume name. Map `/dev/rdiskN` ↔ `/dev/diskN`. Do not change drive `key` / identity strings. Do not edit `optical_cdio.py`; Darwin classify already returns `kind="data"`.
2. Add `src/musicweb/exclusive/optical_fs.py`: closed allowlist from [context/disc-files.md](context/disc-files.md) (`.mp3` `.aac` `.wma` `.flac` `.alac`; `.m4a` only after importing `mp4_kind`). Skip dotfiles / `._*`. `walk_volume(root) -> CdromIndex` (dirs, files, `auto_add_rel`), `jail_join(root, rel) -> Path | None` (reject list in Invariants).
3. Extend `OpticalMedia` / `to_dict` / `media_signature` in `src/musicweb/exclusive/optical.py` with `volume_name: str | None` (serialized) and `volume_id: str | None` (signature only, not in `to_dict`). Do not serialize a host path.
4. In `src/musicweb/exclusive/optical_session.py`, on `kind == "data"` resolve the mount (retry each watch tick if missing). Walk once when a mount appears. Cache `{ device_id, mount_path, volume_name, volume_id }` plus the index. Watch: if a data session is live, poll mount presence + `volume_id` — not `port.read()`. Unmount or `volume_id` change clears the index and broadcasts gone or a new `optical_media` + `cdrom_index`. Keep the existing “do not TOC-read while `CddaReader` live” rule for audio.
5. Add protocol constants in `src/musicweb/exclusive/protocol.py` and `frontend/src/exclusive/protocol.ts`: `list_cdrom`, `cdrom_list`, `cdrom_index`. `cdrom_index` carries `volume_name`, `auto_add_rel`, folder rels + file counts. `list_cdrom` is `{ deviceId, rel }`; `cdrom_list` returns dirs + files (`name`, `rel`, walk-time `source_codec` from the allowlist / `mp4_kind` probe). Tags come in stage 03.
6. Wire `ExclusiveHub` in `src/musicweb/exclusive/session.py` (`COMMANDS` + `_cmd_list_cdrom`) through `OpticalSession`. Controller-only, same as other optical commands.
7. Tests: `tests/exclusive/test_optical.py` keeps `kind == "data"` present; add “data watch does not call `read` after the first classify”; `media_signature` changes when `volume_id` goes None→id or id→other. `tests/exclusive/test_optical_fs.py` for allowlist (`.mp3`/`.m4a` in; `.ogg`/`.wav`/`.opus`/`.mp4` out), jail escape (`..`, absolute, NUL, drive letter), auto-add (root-only, single folder, two folders → null). `tests/exclusive/test_optical_volume.py` for rdisk/disk normalization and delayed mount with a **fake** info source that can return `volume_id` and withhold the mount for N ticks. `frontend/tests/exclusive/protocol.test.ts` asserts the new message strings.

### Verify

- `uv run pytest tests/exclusive/test_optical.py tests/exclusive/test_optical_fs.py tests/exclusive/test_optical_volume.py`
- `pnpm --dir frontend test -- frontend/tests/exclusive/protocol.test.ts`
- `rg -n "cdio_open|port.read" src/musicweb/exclusive/optical_session.py` shows the data-disc poll does not go through `port.read` after the first classify.

## Acceptance

- A fake Darwin data disc (fake info source, stated `volume_id` + mount path) yields `kind=data`, a `volume_name`, a jailed walk, and `auto_add_rel` that matches the one-directory rule.
- A classify with no mount yet stays present with an empty listing; a later fake mount broadcasts and walks.
- A second fake disc with the same name and a different `volume_id` rebuilds the index.
- Subsequent watch ticks on that disc do not TOC-open the device.
- Escaping `rel` (`..`, absolute) is rejected.
- Protocol string constants match on Python and TS.
- Red Book audio classify + CD-Extra trailing-data behavior is unchanged.
