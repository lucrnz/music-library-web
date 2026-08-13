# Playback and quality

How the client chooses **what** to play (stream vs downloaded file), **which** quality profile to use, and when to **prepare** server encodes — without weakening server encode policy.

## Source of truth

- Player store: `src/musicweb/static/js/stores/player.js`
- Quality / network prefs: `src/musicweb/static/js/stores/settings.js`
- Session queue + prepare helpers: `src/musicweb/static/js/stores/playlist.js`
- Play source resolution: `src/musicweb/static/js/downloads/resolve.js`
- Block reasons / copy: `src/musicweb/static/js/playBlock.js`
- Quality ranking: `src/musicweb/static/js/qualityRank.js`
- Status presentation: `src/musicweb/static/js/playbackStatus.js`
- Codec honesty (browser decode probes): `src/musicweb/static/js/codecSupport.js`, `codecProbes.js`
- HTTP stream / prepare: `src/musicweb/static/js/api.js`, `src/musicweb/routes/media.py`
- Stream profiles (server): `src/musicweb/transcode/profiles.py`
- Related: `docs/systems/transcoding.md`, `docs/systems/downloads.md`, `docs/systems/exclusive-audio.md`, `docs/product/core-guidelines.md`

When exclusive audio is **enabled** on an installed Mac PWA, browser quality prefs and download-vs-stream policy are hidden; prepare and play use per-track exclusive FLAC tags through the companion sink. See `docs/systems/exclusive-audio.md`.

## Delivery source

Each successful load records a **play source** (not a library path):

| Source | Meaning |
|--------|---------|
| `streaming` | Playing a server stream URL for the active stream profile |
| `downloaded` | Playing a local OPFS blob from the downloads catalog |
| `unavailable` | Cannot start; structured block reason set |
| `none` | Player idle (no current load) |

Resolution is decision-first: load catalog record when downloads are enabled, apply **playback policy**, open a local blob only if local wins, otherwise stream when online. Offline without a playable local file is unavailable (with reasons such as missing, broken, or offline-without-local — exact set in `playBlock.js`).

## Quality preferences

Independent client preferences (exact storage keys and defaults live in `settings.js`):

- **Wi‑Fi / unrestricted** stream profile
- **Cellular** stream profile (when connection type is detectable; otherwise stream uses the unrestricted choice)
- **Download** profile used when enqueueing offline copies
- **Playback policy** when a download exists while online:
  - Prefer higher quality (use local when at least as good as the active stream profile)
  - Prefer downloaded file
  - Prefer live stream when online (local only when offline / stream unavailable)

Active stream profile for prepare and play follows the current network constraint state when type detection works. Network cost hints never replace an explicit user setting.

## Honest codecs

Settings and download/stream pickers list only profiles the **current browser can decode**, via runtime media probes — not UA marketing lists alone. Server profile catalog still comes from `/api/codecs`; the client filters and ranks.

## Prepare and near-end urgent prepare

- **Prepare** asks the server to prewarm encodes for queue tracks that will need a stream (see `docs/systems/transcoding.md`).
- When downloads are enabled, tracks that will play from a local file under the current policy need not be prepared for stream.
- Near end of the current track, the player may send **one** urgent prepare for the next queue item so interactive encode priority can run before natural advance. Offline does not permanently suppress prepare after reconnect while still in the lead window (behavior owned by the player store).

Exact lead time and API flags live in source.

## Guardrails

- Prefer transparent server encode paths; do not document or implement client-side re-encode shortcuts that fight `docs/systems/transcoding.md` / product audio rules.
- Keep play-source and block-reason writes atomic on the player store so UI never sees mixed fields from a half-failed load.
- Prefer stable track IDs for stream, prepare, and download keys over paths.
- Do not claim a codec is playable without a successful probe path for that browser.
- Network Information API absence is normal on desktop — UI and policy must degrade gracefully (hide cellular-only options; treat connection as unrestricted).
