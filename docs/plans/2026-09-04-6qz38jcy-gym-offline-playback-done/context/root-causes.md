# Root causes (gym session reports)

Investigation notes. Not living docs. Decisions live in [design.md](design.md).

## Offline album covers sometimes missing

Album art is already fetched after audio commit (`finalizeTrackDownload` → `refreshCatalogArt` → `ensureAlbumArtFiles` thumb + full). Failure is swallowed; the track stays `ready`.

Now-playing covers (`updateMediaSession` → `resolveCoverUrl`) use local OPFS/companion when `!canUseRemoteMedia()`, else placeholder. That resolve runs once per `playIndex`. If art has not been written yet, or the fetch failed earlier, nothing retries while you stay “offline.”

False-offline (below) also refuses `/api/cover` even when the network works.

## List albums, tap play, “you’re offline”

Play uses `canUseRemoteMedia()` (`state === "online"` ∧ `!browserOffline()` ∧ `reportSuccess` this page). Browse does not. A successful album list calls `noteServerReachable()` → `reportSuccess()`, but `reportSuccess()` returns early when `navigator.onLine === false` and forces `offline`. Play then returns `offline_no_local`.

`GET /api/codecs` (4s abort → `server_down`) and window `offline` have the same effect. Health probes only run when the download queue or pending artist-art has work, so a later good browse is the only recovery — and it is discarded if Chromium still claims offline.

## Artist photo flip offline

By design today: `resolveCoverFlip` requires `canReachServer()`, `GET /api/artists/{id}`, and a remote `size=full` URL. Downloads only store artist **thumb**. Catalog artist rows have no `hasFull` and no flip flags.

## Lyrics offline

By design today: IDB write happens only if the user opens lyrics while online and the track is already in the catalog (`resolveLyrics`). The download job never calls `GET /api/tracks/{id}/lyrics`. Offline overlay uses `allowNetwork: canReachServer()`.

## Instant retry stutter

`createRejoinClock.schedule()` is 1s → 8s. `kick()` runs immediately. `onConnectivityRecovered` → `queueJoin.kick()`. Flapping `online` events reload the element with no delay. Radio uses the same clock.
