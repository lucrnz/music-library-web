# Playback and quality

How the client chooses **what** to play (stream vs downloaded file), **which** quality profile to use, and when to **prepare** server encodes — without weakening server encode policy. Lossy-indexed tracks ignore quality prefs and play the original (`source` delivery). Exclusive plays a local locker file when policy says so, otherwise streams `source` into mpv (no companion FLAC remux). `exclusive_lossy` is only the no-local and no-source-url case. HTML play probes mp3/aac for source delivery; a failed family probe is `codec_unsupported`, a load or network failure is `play_failed`. Prepare skips those ids (browser and exclusive). The compact status line stays `Streaming · MP3 320` (source format), not an unused Opus/FLAC profile. Playback details for a lossy original (stream or downloaded) also lists Bitrate, Encoding (`CBR` / `VBR` / `ABR` when known), and the **file** sample rate; any unknown value is omitted. Downloaded originals reuse the same track fields — the catalog keeps sample rate and bitrate mode. Older catalog rows omit those extra rows until that track is downloaded again.

## Source of truth

- Player transport: `frontend/src/stores/player.ts` (on-demand wiring, next/prev, Media Session); `playerState.ts`, `playerSession.ts`, `playerPrefs.ts`, `playbackPosition.ts`
- Queue hold / rejoin / hard-block set: `frontend/src/playback/queueJoin.ts`
- Shared join clocks: `frontend/src/playback/joinHold.ts`, `frontend/src/playback/rejoinClock.ts`, `frontend/src/playback/joinTimeout.ts`
- Load/fail: `frontend/src/playback/load.ts` (`loadResolved`, `failCurrentLoad`, `PlayBlockError` via `playBlock.ts`)
- Play decision: `frontend/src/playback/playIntent.ts` (`resolvePlayIntent`, `shouldPrepare`, `isPlayableNow`)
- Exclusive URL / profile / block (no sink): `frontend/src/playback/exclusiveDelivery.ts`
- Exclusive delivery builder: `frontend/src/playback/deliveryPolicy.ts` (`sink` + `profileFor`)
- Shared prepare: `frontend/src/playback/prepare.ts` (`prepareTracks`)
- Session handoff: `frontend/src/playback/session.ts` (`become("none" | "queue" | "radio" | "cd")`). CD does not go through `resolvePlayIntent` or `player.ts`; delivery is companion loopback via `playback/cdLoad.ts`. Compact status is the CD face. Playback details may list 16/44.1 and exclusive hog when exclusive is on. The disc list is `CdTrackList`, not `PlaylistView`. Queue mutations use `queueActionsAllowed()`. See [cd-playback.md](cd-playback.md).
- Shared HTML element: `frontend/src/playback/sinks/htmlElement.ts`
- Companion-stop decision: `needsCompanionStop` in `playback/playIntent.ts`
- Quality prefs: `frontend/src/stores/settings.ts` (maps `/api/codecs` to camelCase once at hydrate; `setStreamCodec` / `setPlaybackPolicy` persist only)
- Prepare-on-change: `frontend/src/stores/player.ts` watches `settings.streamCodec`, `settings.playbackPolicy`, and `exclusiveAudio.enabled` and owns prepare plus `reloadCurrentQueueTrack` (same seek + pause/play as exclusive toggle; exclusive off hands off to the HTML sink)
- Session queue: `frontend/src/stores/playlist.ts`
- Delivery tag / lossy kind: `frontend/src/lossyKind.ts`
- HTML play-source resolution: `frontend/src/downloads/resolve.ts` (`resolvePlaySource` → delivery only; queue via `playIntent.ts`, radio via `radio/session.ts`)
- Exclusive profile pick: `frontend/src/stores/exclusiveAudio.ts`
- Block reasons / copy: `frontend/src/playBlock.ts`
- Quality ranking: `frontend/src/qualityRank.ts`
- Status presentation: `frontend/src/playbackStatus.ts`
- Codec honesty (browser decode probes): `frontend/src/codecSupport.ts`, `codecProbes.ts`
- HTTP stream / prepare: `frontend/src/api.ts`, `src/musicweb/routes/media.py`
- Stream profiles (server): `src/musicweb/transcode/profiles.py`
- Related: `docs/systems/transcoding.md`, `docs/systems/radio.md`, `docs/systems/downloads.md`, `docs/systems/exclusive-audio.md`, `docs/product/core-guidelines.md`

When exclusive audio is **enabled** on an installed desktop PWA (macOS or Windows), the Streaming picker is hidden. Downloads quality and **When a download exists** still apply: exclusive may play a companion-disk download, or stream an exclusive FLAC tag (lossy: `source` into mpv). Leftover OPFS stays HTML-only. `exclusive_lossy` is only the case where there is no local file and no source URL. Exclusive-lossy details list source-format rows; exclusive prepare does not POST `source`. See `docs/systems/exclusive-audio.md`.

## Delivery source

Each successful load records a **play source** (not a library path):

| Source | Meaning |
|--------|---------|
| `streaming` | Playing a server stream URL for the active stream profile |
| `cd` | Playing a live companion `/cdda/` WAV (optical). Not `resolvePlayIntent`. |
| `downloaded` | Playing a local catalog file (OPFS blob or companion loopback URL) |
| `unavailable` | Cannot start; structured block reason set |
| `none` | Player idle (no current load) |

Resolution is decision-first: load catalog record when downloads are enabled, apply **playback policy**, open a local blob only if local wins, otherwise stream when the server is reachable. Play-source “online” means `canUseRemoteMedia()` in `connectivity.js` (`canReachServer()` and this page has seen `reportSuccess`) — not `navigator.onLine` alone, and not the optimistic boot `online` state. Until that confirmation, a playable download wins. When `canUseRemoteMedia()` is false, resolve uses the same offline path: a playable download wins, otherwise unavailable (reasons such as missing, broken, or offline-without-local — exact set in `playBlock.js`). After a downloaded blob fails to play, stream fallback uses that same helper; unconfirmed or unreachable is `broken`, not `/api/stream`. A failed stream load does not fall back to OPFS while the session is confirmed reachable.

When downloads are enabled and remote media is unusable, queue rows without a playable local file are `isOfflineUnplayable` (`playBlock.ts`) — `PlaylistView.rowUnavailable` and the `playNext` / `playPrev` skip gate share that helper. Cursor advance is `stepNext` / `stepPrev` on a record; skip is `pl.advanceToPlayable` (clone + those steps). `playNext` / `playPrev` stay thin; a tap still `playIndex`s that index. `computeNextIndex` / `peekNextIndex` stay download-agnostic. Current playback is not yanked when reachability drops.

The reactive `player` record lives in `playerState.ts`. Cover / Media Session metadata: `playerSession.ts`. Volume / expanded storage: `playerPrefs.ts` (`setOutputVolume` is the only writer — face + storage; `initOutputVolume` from `main.ts` before `createApp` notifies subscribers; on-demand subscribes `getActiveSink().setVolume`; radio subscribes `radioAudio.setVolume`). Resume position: `playbackPosition.ts` (`musicweb.playbackPosition.v1`). `player.ts` owns on-demand transport and sink wiring. Load/fail is `playback/load.ts` (`loadResolved`, `failCurrentLoad`). `resolvePlayIntent` is the single play decision (unavailable with a block, or ready with a required url): exclusive is the companion sink (locker file URL, exclusive FLAC tag, or lossy `source` stream — leftover OPFS `blob:` URLs stay HTML-only); HTML `resolvePlaySource` returns delivery only (`source` / `url` / `profile` / `block` — no sink). `resolvePlayIntent` attaches `htmlAudio` or `companion`. Failures go through `failCurrentLoad({ reason, message?, toast? })` (exclusive toasts without a title prefix and opens Settings on `exclusive_needs_device`; other blocks prefix `Title:`). Sink/load failures are `PlayBlockError`. `applyIntent` is the only play-source writer. The exclusive device gate is `companionSink.load`. A broken local blob remints via `loadResolved({ localBroken: true })`. `prepareTracks` is the only prepare path (queue add, settings codec change, near-end). `preparedKeys`, `requestPrepare`, and `requestForget` live in `playback/prepare.ts`. `setStreamCodec` persists only. `player.ts` owns prepare-on-change plus `reloadCurrentQueueTrack`. `player.ts` does not import `radio.ts`.

On-demand teardown: `beginLoad` always stops the HTML sink, bumps generation, and clears play-source state. Companion stops only when the new intent is unavailable or the sink changes (`needsCompanionStop`). Exclusive track-to-track stays `selectSink` no-op + `load` (does not release the hog). Leaving on-demand (`become("none")` / `become("radio")`) stops both sinks and revokes the local blob. A sink error while `playSource` is `none` is ignored.

## Queue join

A queue start is committed only after the shared hold (`JOIN_HOLD_MS`) survives. `play()` resolving, a sink `load` resolving, or a soft `play()` reject is not a committed start. HTML waits for `canplay` then `play()`; companion waits for first duration. Both waits are capped at the shared load timeout (`JOIN_LOAD_TIMEOUT_MS`). The 8 s hold starts only after a real play when the user did not ask to pause.

Until the hold completes, an unintentional pause, retryable error, soft reject (`NotAllowedError` / `AbortError`), load timeout, or `ended` far from duration stays on the current row and retries forever from last heard position (`currentTime` when it has moved, else the seek this `playIndex` already intended). Retry chrome is silent: no toast, `player.loadPending` stays true so Play shows “Loading stream…”. The rejoin clock is the shared 1 s → 8 s backoff (`createRejoinClock`). After the hold elapses, pause is ordinary pause and the rejoin clock is not armed.

Intentional pause (in-app Pause, lock-screen, headset / Media Session) sets a user-pause mark before the sink pauses, cancels hold and rejoin, and stays paused. `wantPaused` after a successful load is the same. Natural `ended` (within the existing 3 s near-end epsilon, or repeat-one) cancels the loop and advances or loops; it does not schedule rejoin.

Hard blocks still go through `failCurrentLoad` once and do not spin: `codec_unsupported`, `exclusive_needs_device`, `exclusive_no_format`, `exclusive_readonly`, `exclusive_lossy`, `missing`, `broken`, `no_id`, `offline_no_local`. Connectivity recovery kicks an unfinished retryable join (load pending, hold pending, or rejoin scheduled) when the user has not intentionally paused; `offline_no_local` can heal when the server returns. CD is not on this loop.

`GET /api/stream` still blocks until the encode is complete and never serves `.partial`. Client abort of a waiting GET must not be assumed to cancel the encode job. Prepare stays fire-and-forget. `player.ts` does not import `radio.ts`. Radio uses the same clocks but keeps its own pause-during-hold rule (any pause during the radio hold is a failed Tune-in).

Household radio **does** use `resolvePlaySource` with the same `playbackPolicy` as queue play when exclusive is off. While the tuner socket is up, radio passes `offline: false` (do not use queue’s `canUseRemoteMedia()` here). Exclusive on: `exclusiveDelivery` + companion `radioAudio` backend (locker / exclusive FLAC tag / lossy `source`); Tune-in does not unhog; unarmed exclusive Tune-in hard-fails. After load it instructed-seeks to the station clock. A broken local file remints (`markTrackBroken`, same generation). Household `tune_in` prepare is unchanged. Display clocks: not tuned / tuning follow the official snapshot; tuned follows `radioAudio.currentTime` (re-seek if drift > 2s; skip reseek when official position is past `radioAudio.duration`). Radio now-playing reuses `NowPlayingView` (`setRangeFill`, injected `PlaybackStatusLine`) — not a second badge. In the radio room (mobile `/radio` / desktop rail) the codec line mounts only while tuned and reports the real play source (exclusive face when exclusive is enabled); the status wrap stays reserved. After Tune out the stopped radio face stays on the off-radio mini or compact bar. Radio chrome is `inactive | stopped | tuning | tuned`. Opening the tab without Tune-in stays `inactive` with `tabOpen`. `radioGen` guards `loadCurrent`; the face handler is the snapshot load driver. A failed join stays `tuning` and retries (see `docs/systems/radio.md`); it does not leave the session. A join that plays then stops in the first 8 s is that same failed join, not a Tune-out. A library/queue play calls `become("queue")`. Radio volume apply is a `playerPrefs` subscriber (`initRadioListeners` from `main.ts`); `settings.playbackPolicy`, exclusive enabled/format/device, streamCodec, and connectivity watches also live in that boot init, not in `connect()`. See `docs/systems/radio.md`.

The **expanded** now-playing cover (mobile sheet, desktop panel) can 3D-flip to the album-artist photo. Eligible when `GET /api/artists/{id}` (mapped through `fromApiArtist`) reports `hasImage` or `hasPreferredImage` and `canReachServer()` is true; otherwise the cover is not a toggle. The peek resets on track change, collapse, or unmount. The lyrics overlay blocks the flip and does not change the face. An unreachable server disables the feature until the server is reachable again. Mini and compact-bar covers stay open-targets (expand now-playing); they do not flip. Helper: `frontend/src/components/player/coverFlip.ts`.

Status line and Playback details take a `PlayStatusState` with required `session: "none" | "queue" | "radio" | "cd"`. Exclusive face and exclusive detail rows apply when the exclusive snap is enabled and `session` is `"queue"`, `"radio"`, or `"cd"`. A CD session still uses the CD compact face (Reading / Detecting / Playing / …), not the exclusive Ready line. Radio injects `radioPlayState()` (`session: "radio"`) and `exclusiveStatusSnapshot()` when exclusive is on. `PlaybackStatusLine` uses `useDesktopViewport` from `layout.ts` for the desktop breakpoint.

## Resume position

The current track’s last paused (or page-hidden) time is one `{ trackId, seconds }` slot in `musicweb.playbackPosition.v1`, not the playlist blob.

It is written on any pause, on page hide / document hidden, and on seek while paused. Boot hydrates the now-playing bar from that slot and the track tag duration. Media is not loaded and Play is not started. Seek runs only on the first Play while `playSource` is still `none`. An already-loaded tap of the current queue row still starts at 0 and clears the slot. Remote now-playing covers wait for `canUseRemoteMedia()` (same gate as play); a boot resolve that only has the placeholder is not cached so the first `reportSuccess` can paint `/api/cover`. The restored seek range fill is painted on first mount (`setRangeFill`), not only after a later time update.

Apply only when the saved id matches the current track. Clear on stop, skip, track end, and a different-track load. A save within 3 seconds of duration (or past the end) restores at 0. Exclusive companion uses the same rules; seek waits until duration is known. Auto-play on restore is out of product scope.

## Quality preferences

Independent client preferences (exact storage keys and defaults live in `settings.js`):

- **Streaming** profile
- **Download** profile used when enqueueing offline copies
- **Playback policy** when a download exists while online (queue play **and** radio):
  - Prefer higher quality (use local when it is at least as good as the stream profile)
  - Prefer downloaded file
  - Prefer live stream when the server is reachable (queue: `canUseRemoteMedia()`; radio: tuner socket up) (local only when that online check fails)

The browser catalog is fetched at boot when the server answers and mapped to camelCase once in settings (`musicweb.codecCatalog.v1`). That boot GET is a live probe (`cache: "no-store"`) so HTTP cache cannot confirm reachability. Offline or failed fetch reuses that cache; stored quality tags are not rewritten against the hardcoded one-row stub. Decode probes still run locally after hydrate and after a successful fetch.

The Streaming setting is the active stream profile for prepare and play. Changing it reloads the current queue row at the current seek and keeps paused/playing (`reloadCurrentQueueTrack`, the same helper as exclusive enable/disable). Play/Pause during that load does not start a second `playIndex`. A watch-time `play()` autoplay reject stays attached; the next Play is `resume()`. The Play button is busy while `player.loadPending`.

## Honest codecs

Settings and download/stream pickers list only profiles the **current browser can decode**, via runtime media probes — not UA marketing lists alone. The server catalog comes from `/api/codecs` (cached in `settings.js` for offline boot); the client filters and ranks. Settings Streaming and Downloads quality **open lists** may show a `~N MB/h` hint from mapped `approxMbPerHour`. The closed trigger, now-playing status/details, downloads manager, radio, Exclusive Audio, and every other codec label must not display that hint.

## Prepare and near-end urgent prepare

- **Prepare** asks the server to prewarm encodes for queue tracks that will need a stream (see `docs/systems/transcoding.md`).
- Lossy / `source` delivery is never prepared (no encode exists). Exclusive prepare also skips those ids — there is no companion tag for them.
- When downloads are enabled, lossless tracks that will play from a local file under the current policy need not be prepared for stream.
- Download-manager prewarm is a separate prepare `tier` and a separate client skip list from play `preparedKeys`. Play-queue prepare and near-end urgent prepare are unchanged. Window and forget rules: `docs/systems/downloads.md`.
- Near end of the current track, the player may send **one** urgent prepare for the next queue item so interactive encode priority can run before natural advance. Offline does not permanently suppress prepare after reconnect while still in the lead window (behavior owned by the player store).
- **Forget** (`POST /api/transcode/forget`) runs when the user clears the queue or removes the last remaining row of a track. The client sends only ids that no longer appear in the remaining queue (duplicates stay). The call is fire-and-forget from `requestForget` in `playback/prepare.ts`; matching `preparedKeys` (`id|…`) are dropped. **Play all** (`replaceQueue` / `playAllTracks`) forgets only ids that leave and prepares the new set with `replace: true`; it always starts index 0 at 0 (resume slot cleared). Loading a saved playlist does not forget and does not auto-play.

Exact lead time and API flags live in source.

## Guardrails

- Prefer transparent server encode paths; do not document or implement client-side re-encode shortcuts that fight `docs/systems/transcoding.md` / product audio rules.
- Keep play-source and block-reason writes atomic on the player store so UI never sees mixed fields from a half-failed load.
- Prefer stable track IDs for stream, prepare, and download keys over paths.
- Do not claim a codec is playable without a successful probe path for that browser.
- Do not use `isHardOffline()` alone to decide stream vs download — play-source online is `canUseRemoteMedia()`.
