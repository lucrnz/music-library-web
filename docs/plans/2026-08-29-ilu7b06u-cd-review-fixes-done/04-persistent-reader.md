# Stage 04: Persistent CDDA reader

## Status
done

## Description

Reuse one `CddaReader` per `(device, track)` across HTTP Range requests. Yield sector chunks. Drop the reader on track change, eject, or watch-off — not on every GET.

## Rationale

The 6 s ring is theater if every `/cdda` call constructs a new `ParanoiaSource` and `read_span` materializes the whole range under the lock.

## Invariants

- One live reader on the port. Opening a different `(device, track)` drops the previous one.
- A Range that is already in the ring does not re-`identify` / re-open paranoia.
- An out-of-ring seek cancels in-flight prime and primes from the new LBA.
- Watch-off, eject, and track change drop the reader. `release_device` does not (stage 03).
- Stub port still returns no reader (404).
- Silent-zero on a destroyed sector may still tick (existing correction policy).

## Risks

- Holding `_lock` across 450 blocking sector reads still blocks cancel. Prime under lock only for ring bookkeeping; perform `read_sector` so `cancel_in_flight` can win between sectors (or equivalent: drop/recreate on cancel).
- mpv overlapping Ranges: cancel the in-flight prime, serve the latest Range from the same reader.

## Implementation

### Files

- `src/musicweb/exclusive/optical_cdio.py`
- `src/musicweb/exclusive/optical.py`
- `src/musicweb/exclusive/cdda_stream.py`
- `src/musicweb/exclusive/optical_session.py`
- `src/musicweb/exclusive/app.py`
- `tests/exclusive/test_cdda_stream.py`
- `tests/exclusive/test_optical.py`

### Steps

1. `DarwinOpticalPort.open_track`: if the live reader is already that device+track, return it. Else drop and build one `CddaReader` / `ParanoiaSource`.
2. `CddaReader`: stop `read_span` of the entire request into one `bytearray` as the HTTP body. Provide a chunk iterator over sectors (header slice + PCM). Do not hold the ring lock across a full 450-sector prime I/O burst.
3. `app.py` `get_cdda`: stream those chunks. A second Range on the same track does not call `cdio_cddap_identify` again (inject a `SectorSource` and count `open` / identify).
4. Out-of-ring start byte: `cancel_in_flight` then prime from that LBA on the same reader.
5. Tests: two Ranges on track 1 reuse the source; track 2 drops track 1; watch-off drops; injected source open-count is 1 for two Ranges.

### Verify

```sh
uv run --group dev pytest tests/exclusive/test_cdda_stream.py tests/exclusive/test_optical.py
```

## Acceptance

- Two HTTP Ranges for the same device+track do not construct a second paranoia/identify.
- The response body is chunked PCM, not one materialized span yield.
- Changing track or turning watch off drops the reader.
- Byte-map / header tests in `test_cdda_stream.py` still pass.
