# Stage 02: Track audio tech on API and client Track

## Status
done

## Description

Expose each track’s **sample rate and bit depth** on track JSON (already in DB) and on the client `Track` model. When stream/prepare runs for a track with null tech, **log at most once per track id per process**.

## Rationale

Source-preferred exclusive tags need per-track tech in the PWA. Unbounded server logs on range requests would be noise; once-per-id is enough for operators.

## Implementation

- Extend `track_dict` (and any parallel track shapes if they bypass it) with snake_case fields consistent with the API, e.g. `sample_rate_hz`, `bit_depth` (nullable).
- Client: `sampleRateHz`, `bitDepth` on `Track` via `fromApiTrack` / `mapTracks`.
- Offline catalog tech optional/null; exclusive play is online-stream based—do not block on OPFS migration.
- Server: on stream and prepare, if track tech is null, warning log **memoized by track id** for the process lifetime (not every byte/range).
- Manual: GET a scanned track shows rate/depth; force a null-tech path in dev if needed and confirm a single log line per id under repeated stream hits.
