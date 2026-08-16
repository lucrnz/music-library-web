# Playback and quality

How the client chooses **what** to play (stream vs downloaded file), **which** quality profile to use, and when to **prepare** server encodes — without weakening server encode policy. Lossy-indexed tracks ignore quality prefs and play the original (`source` delivery). Exclusive mode refuses them (`exclusive_lossy`) and does not pick a companion FLAC tag. HTML play probes mp3/aac for source delivery; a failed family probe is `codec_unsupported`, a load or network failure is `play_failed`. Prepare skips those ids (browser and exclusive). Status shows `Streaming · MP3 320` (source format), not an unused Opus/FLAC profile.

## Source of truth

- Player store: `frontend/js/stores/player.js` (loaders); `playerState.js`, `playerSession.js`, `playerPrefs.js`
- Quality / network prefs: `frontend/js/stores/settings.js`
- Session queue + prepare helpers: `frontend/js/stores/playlist.js`
- Delivery tag / lossy kind: `frontend/js/lossyKind.js`
- Play source resolution: `frontend/js/downloads/resolve.js`
- Exclusive profile pick: `frontend/js/stores/exclusiveAudio.js`
- Block reasons / copy: `frontend/js/playBlock.js`
- Quality ranking: `frontend/js/qualityRank.js`
- Status presentation: `frontend/js/playbackStatus.js`
- Codec honesty (browser decode probes): `frontend/js/codecSupport.js`, `codecProbes.js`
- HTTP stream / prepare: `frontend/js/api.js`, `src/musicweb/routes/media.py`
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

Resolution is decision-first: load catalog record when downloads are enabled, apply **playback policy**, open a local blob only if local wins, otherwise stream when the server is reachable. Play-source “online” means `canUseRemoteMedia()` in `connectivity.js` (`canReachServer()` and this page has seen `reportSuccess`) — not `navigator.onLine` alone, and not the optimistic boot `online` state. Until that confirmation, a playable download wins. When `canUseRemoteMedia()` is false, resolve uses the same offline path: a playable download wins, otherwise unavailable (reasons such as missing, broken, or offline-without-local — exact set in `playBlock.js`). After a downloaded blob fails to play, stream fallback uses that same helper; unconfirmed or unreachable is `broken`, not `/api/stream`. A failed stream load does not fall back to OPFS while the session is confirmed reachable.

When downloads are enabled and `connectivity.canUseRemote` is false, queue rows without a playable local file (`trackDownloadState` `ready` or `other`) are shown unavailable (`PlaylistView`). Cursor advance is `stepNext` / `stepPrev` on a record; skip is `pl.advanceToPlayable` (clone + those steps). `playNext` / `playPrev` stay thin; a tap still `playIndex`s that index. `computeNextIndex` / `peekNextIndex` stay download-agnostic. Current playback is not yanked when reachability drops.

The reactive `player` record lives in `playerState.js`. Cover / Media Session metadata: `playerSession.js`. Volume / expanded storage: `playerPrefs.js`. Load and sinks stay in `player.js`.

## Quality preferences

Independent client preferences (exact storage keys and defaults live in `settings.js`):

- **Wi‑Fi / unrestricted** stream profile
- **Cellular** stream profile (when connection type is detectable; otherwise stream uses the unrestricted choice)
- **Download** profile used when enqueueing offline copies
- **Playback policy** when a download exists while online:
  - Prefer higher quality (use local when at least as good as the active stream profile)
  - Prefer downloaded file
  - Prefer live stream when the server is reachable (`canUseRemoteMedia()`) (local only when unreachable / stream unavailable)

The browser catalog is fetched at boot when the server answers and stored locally as the raw `/api/codecs` payload (`musicweb.codecCatalog.v1` in `settings.js`). That boot GET is a live probe (`cache: "no-store"`) so HTTP cache cannot confirm reachability. Offline or failed fetch reuses that cache; stored quality tags are not rewritten against the hardcoded one-row stub. Decode probes still run locally after hydrate and after a successful fetch.

Active stream profile for prepare and play follows the current network constraint state when type detection works. Network cost hints never replace an explicit user setting.

## Honest codecs

Settings and download/stream pickers list only profiles the **current browser can decode**, via runtime media probes — not UA marketing lists alone. The server catalog comes from `/api/codecs` (cached in `settings.js` for offline boot); the client filters and ranks.

## Prepare and near-end urgent prepare

- **Prepare** asks the server to prewarm encodes for queue tracks that will need a stream (see `docs/systems/transcoding.md`).
- Lossy / `source` delivery is never prepared (no encode exists). Exclusive prepare also skips those ids — there is no companion tag for them.
- When downloads are enabled, lossless tracks that will play from a local file under the current policy need not be prepared for stream.
- Near end of the current track, the player may send **one** urgent prepare for the next queue item so interactive encode priority can run before natural advance. Offline does not permanently suppress prepare after reconnect while still in the lead window (behavior owned by the player store).

Exact lead time and API flags live in source.

## Guardrails

- Prefer transparent server encode paths; do not document or implement client-side re-encode shortcuts that fight `docs/systems/transcoding.md` / product audio rules.
- Keep play-source and block-reason writes atomic on the player store so UI never sees mixed fields from a half-failed load.
- Prefer stable track IDs for stream, prepare, and download keys over paths.
- Do not claim a codec is playable without a successful probe path for that browser.
- Network Information API absence is normal on desktop — UI and policy must degrade gracefully (hide cellular-only options; treat connection as unrestricted).
- Do not use `isHardOffline()` alone to decide stream vs download — play-source online is `canUseRemoteMedia()`.
