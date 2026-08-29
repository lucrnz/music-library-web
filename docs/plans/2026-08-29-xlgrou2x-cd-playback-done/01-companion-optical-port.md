# Stage 01: Companion optical port

## Status
done

## Description

Add a companion optical interface: list drives, start/stop a watch on the selected device, push media-appeared / media-gone, read TOC + CD-Text, and eject. macOS uses libcdio via ctypes. Windows/Linux return an empty list and reject watch/read/eject. No audio yet.

## Rationale

Every later stage needs a stable device id and a TOC. Shipping the stub on non-Mac now is the Windows-paving decision.

## Invariants

- Companion still binds 127.0.0.1 only and does not open `library.db`.
- Optical commands are controller-only (same lock as hog).
- Missing libcdio: process still starts; `list_optical_drives` returns `[]` and `optical_error` with a safe install hint. Do not exit 1 (mpv remains the only hard Mac dep).
- Do not log device paths next to the token. Media events carry device id + present + toc/cd_text, never file URLs.

## Risks

- ctypes against Homebrew libcdio can break on a soname bump. Pin the find path to `libcdio.21.dylib` / `libcdio.dylib` and fail soft.
- Polling while watch is on can keep a USB SuperDrive awake. Keep the interval near 1 s and stop immediately on `watch_optical` off / controller loss / process stop.

## Implementation

### Files

- `src/musicweb/exclusive/protocol.py`
- `src/musicweb/exclusive/session.py`
- `src/musicweb/exclusive/optical.py`
- `src/musicweb/exclusive/optical_cdio.py`
- `frontend/src/exclusive/protocol.ts`
- `tests/exclusive/test_optical.py`
- `tests/test_exclusive_protocol.py`
- `frontend/tests/exclusive/protocol.test.ts`

### Steps

1. In `src/musicweb/exclusive/protocol.py` add client types `list_optical_drives`, `watch_optical`, `read_optical`, `eject_optical` and server types `optical_drives`, `optical_media`, `optical_error`. Drive item: `{ id, name }`. `optical_media`: `{ device_id, present, toc, cd_text }`. `toc` matches [disc-identity.md](context/disc-identity.md) or is null when empty. `cd_text` is `{ album, artist, tracks: [str] }` or null.
2. Add `src/musicweb/exclusive/optical.py` with the port: `list_drives()`, `read(device_id)`, `watch(device_id, on, emit)`, `eject(device_id) -> None`. Non-Darwin implementation returns empty / `None` / raises a safe “unsupported” and does not import libcdio.
3. Add `src/musicweb/exclusive/optical_cdio.py` (Darwin only): find libcdio, list CD-DA capable devices, read TOC (audio session only; drop a trailing data track from `last_audio_track`), read CD-Text packs into the struct above, eject via libcdio. Poll `read` about once per second while watch is on; emit `optical_media` on present-edge or toc change. If libcdio is missing, `list_drives` is `[]`.
4. Wire `COMMANDS` in `src/musicweb/exclusive/session.py`: the four new messages, controller-only. `watch_optical` off on controller loss, `release_device`, and `stop()`. Fan out `optical_drives` / `optical_media` / `optical_error` like `devices`. Keep the new handlers thin; logic stays in `optical.py`.
5. Mirror the new type strings in `frontend/src/exclusive/protocol.ts` (constants only; no Settings UI yet).
6. Tests: protocol envelope accepts the new types; Darwin-skipped ctypes tests mock libcdio to return a two-track TOC and CD-Text; stub platform lists nothing and eject is unsupported; watch off cancels the poll task.

### Verify

```sh
uv run --group dev pytest tests/test_exclusive_protocol.py tests/exclusive/test_optical.py
pnpm --dir frontend exec vitest run tests/exclusive/protocol.test.ts
```

## Acceptance

- Mac with libcdio: `list_optical_drives` returns optical devices; inserting/removing a disc while watch is on emits `optical_media` with a TOC when present.
- Mac without libcdio, and every Windows/Linux companion: empty list, no crash, companion still serves Downloads / hog stub.
- Readonly sessions cannot start a watch or eject.
- Stub eject is an error, not a crash.
- No temp audio files and no mpv `load` of a CD URL yet.
