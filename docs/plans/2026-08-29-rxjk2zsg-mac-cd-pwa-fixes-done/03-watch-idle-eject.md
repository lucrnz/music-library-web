# Stage 03: Idle watch, honest gone, eject, reconnect

## Status
done

## Description

Stop TOC-polling a drive that has a live `CddaReader`. Failed reads keep last present. Drop the reader before eject. Restart watch on companion hello, drive change, and CD enable-while-in-session. Missing paranoia is an `optical_error`. A disc with no Red Book audio session is `kind=data` (Not an audio CD), not media-gone.

## Rationale

CD mode leaves watch on for the whole occupant. Opening libcdio every second against paranoia is how a playing SuperDrive becomes a fake eject. Eject-busy is the same handle left open. Reconnect today only lists drives, so a restarted companion goes deaf.

## Invariants

- Watch still dies on `watch_optical` off, controller loss, and process stop. Not on `release_device`. Not on `stop`.
- `present=false` is only broadcast for a successful idle read that sees no audio session gone, or after a successful eject.
- `kind` on `optical_media` is `audio` | `none` | `data`. Trailing CD-Extra stays `audio` with the existing lead-out trim.
- Client identify / media-gone runs only when `present` or `kind` actually changes, not on every message that happens to include the field.

## Risks

- Physical eject while playing will not be a TOC edge until the reader drops (WAV/mpv error). Wire that error to drop the reader and do one idle read.
- `cancel_watch` still drops the reader (leave CD / watch off). Re-sending `watch_optical on` must not drop a live reader — restart the poll task only.

## Implementation

### Files

- `src/musicweb/exclusive/optical.py`
- `src/musicweb/exclusive/optical_cdio.py`
- `src/musicweb/exclusive/optical_session.py`
- `frontend/src/exclusive/opticalClient.ts`
- `frontend/src/stores/cd.ts`
- `frontend/src/playback/cdLoad.ts`
- `frontend/src/playbackStatus.ts`
- `frontend/src/components/cd/CdNowPlaying.vue`
- `tests/exclusive/test_optical.py`
- `frontend/tests/stores/cd.test.ts`
- `frontend/tests/playback/playbackStatus.test.ts`

### Steps

1. `OpticalMedia` carries `kind`. `read` sets `audio` when a Red Book TOC exists, `data` when a disc is present but `audio_toc_from_tracks` is None, `none` when the device does not open.
2. `_watch_loop`: if a reader is open for that device, skip `port.read`. On `read` exception, log and **do not** replace last media or broadcast gone.
3. `watch(on=true)` cancels the previous poll task without `drop_reader`. `watch(on=false)` still cancels and drops. `eject` calls `drop_reader` then the ioctl; on success broadcast `kind=none`.
4. `open_track` paranoia failure broadcasts `optical_error` with the install hint (code `libcdio_paranoia_missing`) and returns None.
5. Client: `onCompanionHello` lists drives and, if `activeSession()==="cd"` and enabled with a drive id, `watchOptical(true, id)`. `setCdSelectedDriveId` / `setCdEnabled` while session is `cd` start or stop watch to match the contract (setting on ∧ CD mode).
6. `applyOpticalLive` treats media-gone / re-identify only on actual `present`/`kind` change. `kind==="data"` → face `not_audio`, clear cursor, do not identify. Add `not_audio` to `CdRoomFace`, `formatPrimaryStatus`, and the CdNowPlaying empty subtitle.
7. CD sink `onError` / disconnect: stop transport, `refreshCdFace` (Companion offline when the socket is down).
8. Tests: watch + open_track + a `read` that would throw does not broadcast `present=false`. Eject drops the reader before the port eject. Re-`watch on` does not `close` the current reader. Client rematch + hello re-sends watch when session is cd.

### Verify

```sh
uv run --group dev pytest tests/exclusive/test_optical.py
pnpm --dir frontend exec vitest run tests/stores/cd.test.ts
```

## Acceptance

- Playing a track (reader live) cannot produce a watch `present=false` from a TOC blip.
- Eject no longer fails solely because the paranoia handle is still open.
- Companion restart while CD is on resumes media events without leaving the room.
- A data-session disc is Not an audio CD, not No disc.
- Missing libcdio-paranoia toasts/errors via `optical_error`, not a bare WAV 404.
