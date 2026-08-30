# Stage 04: Sequential paranoia, CD-Text, driver ids

## Status
done

## Description

Read CDDA sectors sequentially (seek once per prime, not per sector). Decode CD-Text as Latin-1 with an MS-JIS guess. Fix Darwin `DRIVER_OSX` / `DRIVER_DEVICE` to current libcdio values.

## Rationale

Overlap+verify is theater if every sector `SEEK_SET`s and the HTTP body waits on a 450-sector prime of those seeks. USB SuperDrives underrun; the face sits on Reading. CD-Text as UTF-8 is wrong for the discs this library actually holds. The fallback device enum currently lists Nero images.

## Invariants

- Modes stay overlap+verify. NEVERSKIP stays off. Ring stays ~6 s (450 sectors).
- A destroyed sector may still emit silence; do not skip the track.
- CD-Text-only still never writes server rows (client unchanged).

## Risks

- ctypes `paranoia_read` without a seek must be proven with a mock that counts `seek` vs `read`. Do not require a live drive in CI.
- MS-JIS detection must not scramble clean Latin-1. Prefer “looks like JIS” (high bytes in the JIS range, invalid as a sensible Latin-1 title) over always trying both.

## Implementation

### Files

- `src/musicweb/exclusive/cdda_stream.py`
- `src/musicweb/exclusive/optical_cdio.py`
- `tests/exclusive/test_cdda_stream.py`
- `tests/exclusive/test_optical.py`

### Steps

1. `ParanoiaSource.read_sector`: if the requested LSN is the next sequential LSN after the last successful read, call `read_limited` only. Seek only on a mismatch or the first read of a prime. Track that cursor on the source.
2. Keep `_prime` filling the ring in LSN order so the sequential path is the common case. Out-of-ring seek still `cancel_in_flight` then primes at the new index (one seek).
3. Replace `_decode_c_string` with Latin-1, then MS-JIS when the byte pattern looks like it (central-European CD-Text stays Latin-1).
4. Set `DRIVER_OSX = 6` and `DRIVER_DEVICE = 11` to match current libcdio. `cdio_get_devices_osx` remains the primary list.
5. Tests: a memory/mock source used as paranoia stand-in — or a `ParanoiaSource` with injected seek/read callables — records one seek for a 3-sector sequential prime. Latin-1 `café` round-trips. A JIS fixture decodes to the expected kana/kanji, not `�`. Enum constants are asserted.

### Verify

```sh
uv run --group dev pytest tests/exclusive/test_cdda_stream.py tests/exclusive/test_optical.py
```

## Acceptance

- A forward prime of N sectors performs one seek, not N.
- CD-Text on a Japanese pressing is readable; a Latin-1 European title is unchanged.
- Empty-tray fallback no longer uses the Nero driver id.
