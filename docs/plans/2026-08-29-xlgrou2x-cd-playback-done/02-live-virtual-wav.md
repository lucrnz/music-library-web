# Stage 02: Live virtual WAV

## Status
done

## Description

Serve a token-gated loopback WAV whose bytes are live CDDA sectors, with a 6 s paranoia ring and Range-to-LBA mapping, as specified in [virtual-wav.md](context/virtual-wav.md). Extend companion `load` with an explicit `hog` flag so mpv can play that URL with or without a hog device.

## Rationale

This is the software deck. Identify and chrome can come after; Track N must already be playable.

## Invariants

- No track file on disk. RAM ring only. Drop the ring on eject, watch-off, controller loss, and process stop.
- `GET /cdda/...` never logs `?token=`.
- Non-Mac and missing libcdio: 404.
- Only the currently watched (or last `read_optical`) device id is servable.
- Header + 2352-byte sectors; 16/44.1 stereo only.
- `load` with `hog: false` (or omitted default **true**) does not inspect the URL. Omitted / `true` keeps today’s “select a device first” hard-fail. `false` loads with mpv `audio-device=auto`.

## Risks

- Full paranoia mid-stream can underrun. Overlap+verify and `NEVERSKIP` off are mandatory; treat a long stall as **Reading**, not a 500.
- Concurrent Range + sequential read on one drive: serialize on a per-device lock; a new Range cancels the previous reader.

## Implementation

### Files

- `src/musicweb/exclusive/app.py`
- `src/musicweb/exclusive/cdda_stream.py`
- `src/musicweb/exclusive/optical.py`
- `src/musicweb/exclusive/optical_cdio.py`
- `src/musicweb/exclusive/session.py`
- `src/musicweb/exclusive/mpv_player.py`
- `src/musicweb/exclusive/protocol.py`
- `frontend/src/exclusive/protocol.ts`
- `tests/exclusive/test_cdda_stream.py`
- `tests/exclusive/test_blob_http.py`
- `tests/test_exclusive_hub_release.py`

### Steps

1. Add `src/musicweb/exclusive/cdda_stream.py`: WAV header builder; `content_length(sector_count)`; `range_to_sectors(start, end, first_lsn, sector_count)`; a `CddaReader` that wraps libcdio-paranoia (overlap+verify, never-skip off, speed 8 when possible) and holds ≤450 sectors of PCM. Pure functions must run without a drive.
2. Extend `src/musicweb/exclusive/optical.py` / `optical_cdio.py` with `open_track(device_id, track_no) -> reader | None` using the last TOC.
3. In `src/musicweb/exclusive/app.py` add `GET`/`HEAD` `/cdda/{device_id}/{track_no}` next to `/files/`. Same token HMAC, CORS, PNA. Stream Range slices through the reader. 404 on stub / no media / bad track.
4. Hub in `src/musicweb/exclusive/session.py` exposes the current optical device to the app (or the app asks the hub). Closing the controller drops the reader.
5. In `src/musicweb/exclusive/session.py` `_cmd_load`, read `hog` (default `true`). If `true` and no `_device_id`, keep `ValueError("select a device first")`. If `false`, call `MpvPlayer` to ensure `audio-exclusive=no` and `audio-device=auto` (add a small helper on `src/musicweb/exclusive/mpv_player.py` if `_unhog_unlocked` is not already that), then `loadfile`. Mirror the optional field in `src/musicweb/exclusive/protocol.py` comments / `frontend/src/exclusive/protocol.ts` if a constant is needed. Existing exclusive callers omit the field.
6. Tests: header size and `Content-Length` for a 75-sector track (1.00 s); Range `bytes=44-2395` maps to one sector; a Range inside the header only returns header bytes; stub app returns 404; token reject matches `/files/` tests in `tests/exclusive/test_blob_http.py`. Hub: `load` without device + `hog: false` does not raise; `hog: true` / omitted without device still raises. Do not boot mpv in pytest if existing hub tests already stub the player — follow `tests/test_exclusive_hub_release.py`.

### Verify

```sh
uv run --group dev pytest tests/exclusive/test_cdda_stream.py tests/exclusive/test_blob_http.py tests/test_exclusive_hub_release.py
```

Manual on a Mac with a disc (not CI): `curl -D- -H "Range: bytes=0-43" "http://127.0.0.1:18765/cdda/<id>/1?token=..."` is 44 bytes `RIFF`. Companion `load` of that URL with `hog: false` and no `set_device` makes sound through mpv auto. No wav/flac appears under `~/Library/Application Support/musicweb-companion`.

## Acceptance

- Byte map and Range math are unit-tested without hardware.
- A real disc can be heard through stock mpv via the loopback URL with companion `load` `hog: false` and no hog device.
- Existing exclusive `load` (omitted `hog`) still requires a device.
- Eject during the curl/mpv load fails the stream; the companion stays up.
- Windows/Linux companion is unchanged except for a 404 route.
