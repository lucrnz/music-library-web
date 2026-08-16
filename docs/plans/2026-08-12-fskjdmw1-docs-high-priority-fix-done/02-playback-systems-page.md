# Stage 02: Playback and quality systems page

## Status
done

## Description

Add `docs/systems/playback.md` covering play-source resolution, quality preferences (Wi‑Fi/cellular stream vs download profile), playback policies, codec honesty, and stream prepare / near-end urgent prepare — at intent level only.

## Rationale

Playback policy and delivery resolution span player, settings, playlist prepare, downloads resolve, and server media routes. Product guidelines state user-facing rules; no design doc owns the cross-cutting model. This page is the durable home so agents do not re-infer policy from scattered modules.

## Implementation

1. Create `docs/systems/playback.md` with overview → **Source of truth** → design → **Guardrails**.
2. **Source of truth** pointers (verify paths): `static/js/stores/player.js`, `settings.js`, `playlist.js`; `downloads/resolve.js`; `playBlock.js`, `qualityRank.js`, `playbackStatus.js`, `codecSupport.js` / probes; server `routes/media.py`, `transcode/profiles.py`. Link to `docs/systems/transcoding.md` and `docs/systems/downloads.md` for encode and offline storage boundaries.
3. Document durable behavior (not exact defaults or profile tags):
   - Play source: streaming / downloaded / unavailable + structured block reasons.
   - Playback policies: prefer higher quality / prefer downloaded / prefer stream when online (names as in settings source).
   - Independent Wi‑Fi stream, cellular stream, and download quality preferences when network type is detectable.
   - Codec pickers list only formats the browser can actually decode (runtime probes).
   - Prepare / prewarm and near-end urgent prepare for next queue item; skip prepare when local play is preferred and available (intent only).
4. **Guardrails:** honest capability; network hints never override explicit user settings; prefer stable track IDs; do not weaken server encode policy from the client doc (point at product/transcoding).
5. Do not list profile tags, localStorage keys, or API query params as frozen contracts.
6. Do not update the documentation map yet (stage 05).
