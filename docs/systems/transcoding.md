# Transcoding and streaming

## Source of truth

- Profiles and aresample policy: `src/musicweb/transcode/profiles.py`
- Worker / cache interaction: `src/musicweb/transcode/worker.py`
- Dependency gate: `src/musicweb/transcode/deps.py`
- Probe helpers: `src/musicweb/transcode/probe.py`
- Shared enqueue: `src/musicweb/transcode/enqueue.py`
- Id → path for forget: `src/musicweb/transcode/forget.py`
- HTTP stream / prepare / forget: `src/musicweb/routes/media.py`
- Reserved `source` passthrough, `stream_intent`, and `can_encode`: `src/musicweb/transcode/passthrough.py`
- Idle eviction (last HTTP + in-flight): `src/musicweb/transcode/idle.py`
- Process cache lifecycle: `src/musicweb/cache.py`

## Purpose

Deliver browser-playable audio from a lossless library using **explicit stream profiles** (Opus or FLAC at defined rates/depths). The browser marketing set is the `browser_listed` rows in `profiles.py`: Opus 192/160/128/96/64 kbps at 48 kHz plus the three listed FLACs. Exclusive-only FLAC tags stay off `GET /api/codecs`. Conversion always goes through ffmpeg with quality-first resampling policy. Lossy-indexed tracks are **not** a profile — they use reserved `source` passthrough and never enter this encode pipeline. `stream_intent(is_lossy, codec)` is the only product decision (`passthrough` / `encode` / `reject`). Stream HTTP maps `reject` to 409 (kind mismatch) or 400 (unknown tag). Prepare HTTP validates unknown tags with `get_profile` (400); reserved `SOURCE_TAG` is a valid prepare request (200, enqueue skips all) — not a dummy `stream_intent(is_lossy=False)` probe. `enqueue_prepare` and radio prepare skip when the kind is not `encode`. Forget skips via `can_encode(*, is_lossy)` (lossy originals have no encode cache) — not `stream_intent` with a default profile. Passthrough mime/extension are defined for MP3 and AAC only; an unknown stored source codec is a 400, not an encode and not a guessed container.

## Startup requirements

The process verifies **ffmpeg** and **ffprobe** are on PATH, and ffmpeg exposes **libsoxr**, **libopus**, and **flac**. Missing pieces are fatal at startup — silent fallback to lower-quality resamplers is not allowed.

## Encode policy (intent)

1. If source sample rate **and** bit depth already match the profile → **no aresample**.
2. Else resample with libsoxr at VHQ-equivalent settings; add Shibata dither **only** when reducing bit depth.
3. Force the profile’s sample format and rate; encode Opus or FLAC into a tagged cache file.
4. Source rate/depth should come from scan-time metadata when present; probe at encode time if missing.

Exact argv fragments and profile tags live in `profiles.py`.

## Cache and concurrency

- Completed (and in-flight) encodes live under a **process-temp** `streams/` directory, not the durable data dir.
- Shutdown always deletes this cache. After about an hour with no in-flight HTTP and no recent request, the server also runs `Transcoder.clear_cache()`. Those two are the only full wipes — there is no `POST /api/cache/clear`. Intervals are source constants in `idle.py`. Any HTTP to the library process counts; the control socket and exclusive companion WebSocket do not.
- Queue clear and last-row-of-a-track remove may `POST /api/transcode/forget` with discarded track ids. The server drops those jobs and all-profile cache files unless the id is the radio current track or still remaining on the live radio queue. Body and count fields live in `media.py` / `forget.py`.
- Concurrent requests for the same track+profile share one encode.
- A single worker model applies: interactive play may preempt prewarm; partial files are never served as complete.
- Seeking uses HTTP Range on completed cache files.

## Client interaction

Client quality prefs, play-source resolution, and prepare timing are owned by `docs/systems/playback.md`. Server encode policy stays on this page.

- Stream by stable track id (preferred) with a codec/profile tag.
- Settings UI should only offer profiles the browser can decode (client probes).
- Client may pick one stream tag and one download tag; `/api/codecs` exposes bitrate/depth/rate so the client can rank quality, plus `approx_mb_per_hour` as a product size constant for Settings (not an encode input). `GET /api/exclusive-formats` stays estimate-free.
- Optional prepare endpoint prewarms encodes without blocking the main UX path. Radio and that endpoint share `enqueue_prepare`. Radio must not call `drop_pending_prewarm`. Radio jobs log `log_label` + profile tag, not paths. The 1-hour idle wipe is unchanged. Vite `/api` proxy sets `ws: true` so the radio WebSocket upgrades in `pnpm --dir frontend dev`.
- Client may send prepare with `urgent: true` (near end of the current track, once per playback load) so the next queue item is promoted to the urgent encode tier before natural advance.

## Guardrails

- Do not weaken soxr/dither policy for minor performance wins without a product decision.
- Do not serve `.partial` encodes.
- Do not persist stream cache as user data.
- Do not add encoders that pull in unvetted quality defaults without documenting the decision under architecture/product docs.
