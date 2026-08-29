# Live virtual WAV (companion)

Stock Homebrew mpv has no `cdda://`. The companion pretends the disc is a WAV file on loopback HTTP so mpv’s existing `load` + Range seek work.

## URL

```text
GET http://127.0.0.1:<port>/cdda/{device_id}/{track_no}?token=
```

- Same token gate, CORS, and Private Network Access headers as `/files/…`.
- `device_id` is the id from `list_optical_drives` (stable BSD name / libcdio device string).
- `track_no` is the Red Book track number (usually 1-based).
- Only the controller session’s selected CD drive (Settings preference, currently watched) may be served. Unknown device or no media → 404.
- Do not log the URL (token in the query).

## Byte map

```text
bytes 0..43     RIFF WAV header (PCM, 44100, 16-bit, stereo)
bytes 44+       raw CDDA: 2352 bytes/sector, little-endian
offset 44 + n*2352  →  LBA = track_first_lsn + n
Content-Length  = 44 + sector_count * 2352
```

`sector_count` is `track_last_lsn - track_first_lsn + 1` from the TOC (index-start extents; no pregap). Duration in seconds is `sector_count / 75`.

Range requests: parse `bytes=start-end`, skip the header when `start >= 44`, read only the needed sectors. A seek in mpv is a Range, which resets the RAM ring to that LBA.

## Ring and paranoia

- libcdio-paranoia overlap + verify. `NEVERSKIP` off: after retries, emit the best sector rather than block forever.
- Target spin ~8× (`cdda_speed_set` when the drive allows; ignore failure).
- Keep about 6 seconds (450 sectors) of decoded PCM in process RAM. Never write a track file under the companion data dir or `/tmp` as the play source.
- Sequential play consumes the ring at 1×. Range that lands outside the ring discards it and restarts at the new LBA (status **Reading** until ~1 s is primed).
- Eject, leave CD mode, `watch_optical off`, or companion shutdown drop the ring and 404 further Ranges.

## mpv / hog-or-auto `load`

Companion `load` stays `require_http_url`. The PWA passes `new URL("/cdda/…?token=", "http://127.0.0.1:<port>").href`.

Today `_cmd_load` refuses when `_device_id` is unset. That gate is hog policy, not HTTP. Extend the load message with `hog: bool` (default `true` so existing exclusive/queue callers stay hard-fail):

| `hog` | Companion |
|---|---|
| `true` | require live device (current `ValueError("select a device first")`); mpv exclusive as today |
| `false` | do not require `_device_id`; `audio-exclusive=no`, `audio-device=auto`; then `loadfile` |

Do not inspect the URL path. Queue exclusive keeps sending `hog: true` (or omitting the field). CD sends `hog: exclusiveArmed`. `upsample_device` does not apply: the WAV is already 16/44.1.

Exclusive toggle mid-CD: client stops transport, `load`s the same URL with the new flag, seeks to the previous position.

## Non-Mac stub

`GET /cdda/…` returns 404. `list_optical_drives` is empty. No libcdio import required to start the process.
