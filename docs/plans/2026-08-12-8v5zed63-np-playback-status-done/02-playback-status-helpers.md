# Stage 02: Playback status presentation helpers

## Status
done

## Description

Add pure (or catalog-driven) helpers that turn player play-source state + `settings.options` into primary-line copy and ordered deep-dive rows. No Vue templates yet—only formatters the status line and details panel will share.

## Rationale

Downloads already resolve profile ids to labels via ad-hoc `codecLabel` lookups. Primary line rules differ (lossy family + bitrate only; lossless family only), and deep dive needs structured rows with units (`192 kbps`, `24-bit`, `48 kHz`). One module keeps face text and details consistent and unit-testable without mounting the player.

## Implementation

- Add a focused module under `src/musicweb/static/js/` (e.g. `playbackStatus.js` or `player/playbackStatus.js`—match nearby naming). Depend on existing profile parse/rank helpers in `qualityRank.js` and the codec catalog on `settings.options` (pass catalog in as an argument; do not import the settings store if that creates cycles—caller supplies options).
- Inputs (conceptual): `{ playSource, playProfileId, playBlockReason }` plus catalog list.
- **Primary face:**
  - `none` → static copy `Not playing` (non-interactive later)
  - `streaming` / `downloaded` → short codec text: Opus → `Opus {bitrate}k` (from profile `bitrate_kbps` or parsed id); FLAC → `FLAC` only
  - `unavailable` → `Unavailable`
  - Source word for active sources: `Streaming` / `Downloaded` (product wording from grill)
- **Deep-dive rows** (omit empty; order fixed when present):
  1. Source — Streaming | Downloaded | Unavailable  
  2. Codec — Opus | FLAC (when profile known)  
  3. Bitrate **or** bit depth — `192 kbps` / `24-bit` (lossy vs lossless)  
  4. Sample rate — `48 kHz`  
  5. Profile — full catalog `label` (fallback to profile id)  
  - On `unavailable`: Source, Reason (map `playBlockReason` to the same user strings as `downloads/resolve.js` `MESSAGES` / play notices—share or duplicate carefully to avoid drift), Intended profile if `playProfileId` known. Do not invent bitrate rows for a non-playing stream.
- Export small pure functions, e.g. `formatPrimaryCodecText(profileId, catalog)`, `buildPlaybackDetailsRows(state, catalog)`, and optionally a combined primary descriptor used later for `aria-label`.
- Reuse catalog fields already on `GET /api/codecs` options (`kind`, `bitrate_kbps`, `bit_depth`, `sample_rate`, `label`); parse id via existing `resolveProfileMeta` when catalog row is missing.
- No CSS/components. Optional: tiny unit tests only if the repo already has a JS test runner; otherwise manual table checks against a few profile ids (`opus_192_48000`, a FLAC profile, unknown id).
