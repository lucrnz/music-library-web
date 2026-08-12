# Transcoding and streaming

## Source of truth

- Profiles and aresample policy: `src/musicweb/transcode/profiles.py`
- Worker / cache interaction: `src/musicweb/transcode/worker.py`
- Dependency gate: `src/musicweb/transcode/deps.py`
- Probe helpers: `src/musicweb/transcode/probe.py`
- HTTP stream / prepare / cache clear: `src/musicweb/routes/media.py`
- Process cache lifecycle: `src/musicweb/cache.py`

## Purpose

Deliver browser-playable audio from a lossless library using **explicit stream profiles** (Opus or FLAC at defined rates/depths). Conversion always goes through ffmpeg with quality-first resampling policy.

## Startup requirements

The process verifies ffmpeg exposes **libsoxr**, **libopus**, and **flac**. Missing pieces are fatal at startup — silent fallback to lower-quality resamplers is not allowed.

## Encode policy (intent)

1. If source sample rate **and** bit depth already match the profile → **no aresample**.
2. Else resample with libsoxr at VHQ-equivalent settings; add Shibata dither **only** when reducing bit depth.
3. Force the profile’s sample format and rate; encode Opus or FLAC into a tagged cache file.
4. Source rate/depth should come from scan-time metadata when present; probe at encode time if missing.

Exact argv fragments and profile tags live in `profiles.py`.

## Cache and concurrency

- Completed (and in-flight) encodes live under a **process-temp** `streams/` directory, not the durable data dir.
- Shutdown always deletes this cache.
- Concurrent requests for the same track+profile share one encode.
- A single worker model applies: interactive play may preempt prewarm; partial files are never served as complete.
- Seeking uses HTTP Range on completed cache files.

## Client interaction

Client quality prefs, play-source resolution, and prepare timing are owned by `docs/systems/playback.md`. Server encode policy stays on this page.

- Stream by stable track id (preferred) with a codec/profile tag.
- Settings UI should only offer profiles the browser can decode (client probes).
- Client may pick different profile tags for Wi‑Fi vs cellular streaming and for offline downloads; `/api/codecs` exposes bitrate/depth/rate so the client can rank quality. Network detection is browser-side only.
- Optional prepare endpoint prewarms encodes without blocking the main UX path.
- Client may send prepare with `urgent: true` (near end of the current track, once per playback load) so the next queue item is promoted to the urgent encode tier before natural advance.

## Guardrails

- Do not weaken soxr/dither policy for minor performance wins without a product decision.
- Do not serve `.partial` encodes.
- Do not persist stream cache as user data.
- Do not add encoders that pull in unvetted quality defaults without documenting the decision under architecture/product docs.
