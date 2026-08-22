# Stage 03: Living docs for the marketing set

## Status
done

## Description

Record the expanded browser marketing set, the Settings-only size-hint rule, and that 64/96 kbps Opus is an intentional size option on the existing encoder — not a new lossy format.

## Rationale

`docs/product/core-guidelines.md` and the transcoding/playback pages outlive this plan. Stage 01–02 already shipped the contract; this stage writes that contract into the project’s normal docs so later changes do not treat 64/96 or `/api/codecs` estimates as undocumented.

## Invariants

- Living docs describe intent and ownership. Exact tags, argv, and JSON keys stay sourced from `src/musicweb/transcode/profiles.py` and `src/musicweb/routes/media.py`.
- Do not add a second estimate table that can drift. Point at `approx_mb_per_hour` on `GET /api/codecs` / `StreamProfile`.
- 64/96 kbps is still Opus VBR on lossless sources. Lossy-source transcode remains out of scope.

## Risks

- Over-specifying UI copy in docs will drift from Settings. Describe the rule (Settings quality rows only, `~N MB/h`) without pasting every integer.

## Implementation

### Files

- `docs/systems/transcoding.md`
- `docs/systems/playback.md`
- `docs/product/core-guidelines.md`

### Steps

1. In `docs/systems/transcoding.md`, note that the browser marketing set is the `browser_listed` rows in `profiles.py` (Opus 192/160/128/96/64 at 48 kHz plus the three listed FLACs). State that `GET /api/codecs` includes `approx_mb_per_hour` as a product size constant for Settings, not an encode input. Exclusive-formats stay estimate-free.
2. In `docs/systems/playback.md`, under quality preferences / honest codecs, state that Settings Streaming and Downloads quality **open lists** may show a `~N MB/h` hint from `approxMbPerHour`, and that no other codec surface (closed trigger, now-playing, downloads manager, radio, exclusive) should display it.
3. In `docs/product/core-guidelines.md`, under audio quality / guardrails, record that lower Opus target bitrates (96 and 64 kbps) are allowed marketing options for size and bandwidth on the existing libopus path. They do not relax soxr/dither policy and do not authorize transcoding indexed MP3/AAC.

### Verify

Read the three pages against [context/design.md](context/design.md): marketing set, Settings-only hint, server-owned integer, default still 192, exclusive and lossy-source rules unchanged. Confirm no duplicated numeric table.

## Acceptance

- A reader of `docs/systems/transcoding.md` knows 64/96 exist as `browser_listed` Opus tags and that size estimates live on `/api/codecs`.
- A reader of `docs/systems/playback.md` knows the hint is Settings quality open-rows only.
- A reader of `docs/product/core-guidelines.md` knows 64/96 are intentional size options, not a new lossy format.
- None of the three pages restate encoder argv or the eight integers as a second source of truth.
