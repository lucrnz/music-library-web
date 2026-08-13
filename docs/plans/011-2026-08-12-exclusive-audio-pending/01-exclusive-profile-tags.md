# Stage 01: Exclusive profile tags and exclusive-formats API

## Status
pending

## Description

Register the **full exclusive FLAC allowlist** as resolvable `StreamProfile` tags (grammar `flac_{depth}_{rate}`), keep them out of `GET /api/codecs`, and expose them via **`GET /api/exclusive-formats`**. Existing `GET /api/stream` and `POST /api/transcode/prepare` accept these tags through the same transcoder path—no `/api/exclusive/stream` family.

## Rationale

One encode path and one cache key scheme. The client must not invent tags; the exclusive-formats catalog is the shared contract so formatPolicy and the server cannot drift.

## Implementation

- **Tag grammar:** `flac_{bit_depth}_{sample_rate}` matching existing names (`flac_16_44100`, `flac_16_48000`, `flac_24_96000`).
- **Full matrix (12 tags):** rates `44100, 48000, 88200, 96000, 176400, 192000` × depths `16, 24`. Reuse the three existing FLAC profiles; add the other nine.
- Single catalog in `profiles.py` (or helper that registers into the same resolver) with a clear **browser-listed** vs **resolvable** flag. `get_profile(tag)` accepts all resolvable tags; `/api/codecs` iterates browser-listed only.
- **`GET /api/exclusive-formats`:** JSON like  
  `{ "formats": [ { "tag", "sample_rate", "bit_depth", "label" }, ... ] }`  
  for the full allowlist. No auth beyond LAN trust (same as rest of API).
- Encode policy unchanged: `plan_aresample` / soxr VHQ; dither only when reducing bit depth. Stereo intent: if multi-channel sources need downmix for these tags, put it in exclusive/profile ffmpeg argv once—not a separate route.
- Manual: curl exclusive-formats; curl stream+prepare with a new tag (e.g. `flac_24_192000`); confirm `/api/codecs` does not list exclusive-only tags. Unit-test matrix completeness + aresample edge cases.
