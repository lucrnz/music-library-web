**Archive.** Decisions in this file were current as of 2026-09-04 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Gym offline playback

## Goal

Queue playback on a phone PWA (Chrome Android at the gym, and the same gates everywhere else) must follow **this origin’s last live `/api` result**, not Chromium’s `navigator.onLine`. Downloaded tracks must keep album art, artist-photo flip, and lyrics without the server. Rejoin must not reload in a zero-delay loop.

## Settled decisions

- **Reachability is our probe, not the browser flag.** A live same-origin `/api` success always confirms the session and sets `online`, even when `navigator.onLine === false`. Window `offline` / `online` may start a health probe (including when the download queue is empty); they do not by themselves mark the library unreachable or reachable.
- **Consumers follow that flag.** Play, queue skip, remote covers, flip network, lyrics network, download auto-pause, and connectivity toasts all follow request success/failure. After a **failed** request, `navigator.onLine` may only choose the copy (`offline` vs `server_down`).
- **User tap probes the stream.** `playIndex` on a row that would be `offline_no_local` retries once with remote allowed (try `/api/stream`). A playable local file still wins; do not flip `prefer_stream` into a remote hit when a download exists. A failed probe classifies and can still show `offline_no_local`.
- **Audio download stays the job.** Album art (thumb + full), artist full photo (plus existing thumb), and lyrics are companions: retry while online; a real miss (no lyrics, no artist image) does not fail the job.
- **Placeholder is not a photo.** `GET /api/artist-image` returns a placeholder when there is no portrait. Do not store that as `hasFull` / `hasThumb`. Eligibility is `GET /api/artists/{id}` flags (`hasImage` / `hasPreferredImage` / `isVa` / `preferredRev`). VA flips to the packaged portrait with no file.
- **Existing catalog is backfilled.** Missing album art, artist full photo, and lyrics are filled when online: on play of that downloaded track, and via a quiet catalog pass (not the download-manager queue) that yields to user downloads. No delete-and-redownload.
- **Lyrics IDB:** persist `ok`, `instrumental`, and `not_found`. When online (play or backfill), revalidate `not_found`. Do not persist `pending` / `error`.
- **Rejoin floor is 250ms.** Same 1s → 2s → 4s → 8s clock. Every attempt, including `kick()` (connectivity recovery) and radio, waits at least 250ms. Do not change the 8s join hold.
- **Shared backends.** Gym is Chrome Android PWA / OPFS; the same paths stay shared with desktop companion. Not Android-only.

Root-cause notes: [root-causes.md](root-causes.md).

## Design

Today play uses `canUseRemoteMedia()` = `state === "online"` **and** `navigator.onLine !== false` **and** a page-lifetime `reportSuccess()`. `reportSuccess()` **discards** a live 200 when the browser claims offline and forces `offline`. Browse can still list albums (fetch works) while play returns `offline_no_local`. Chrome Android PWAs lie about `navigator.onLine` on flaky Wi‑Fi.

```
live /api 200  ──►  reportSuccess()  ──►  online + confirmed
                         ▲
window online/offline ───┴── probe only (do not set state)
                         ▲
failed /api (network/5xx/429) ──► reportFailure ──► offline | server_down
                                  (browser flag picks which copy)
```

`apiFetch` is the success/failure reporter for JSON `/api`. The health loop runs while state is `offline` or `server_down` (backoff already 1s–60s), even with an empty download queue, so skip/covers recover without a tap.

Play decision stays decision-first in `resolvePlaySource` / `resolvePlayIntent`. New `probeRemote` is only the `offline_no_local` escape hatch: local file still wins; otherwise one stream attempt.

Companions run after audio commit (`refreshCatalogArt` today). Extend that pass: album thumb+full (already), artist metadata + full (and thumb if missing), lyrics GET persisted to the `lyrics` store. Notify now-playing when album art lands so a play-during-finalize race does not stick on the placeholder. A later quiet walker fills old rows.

Cover flip today requires `canReachServer()` + `GET /api/artists/{id}` + remote `size=full`. Offline flip uses the catalog artist row + local full blob (or VA packaged URL). Lyrics overlay already reads IDB via `resolveLyrics`; it starts working once companions are stored.

Rejoin `schedule()` is already 1s+. `kick()` runs immediately and is what connectivity recovery uses. Floor `kick()` at 250ms; leave the backoff table alone.

## Stage map

Stage 01 first: every later stage’s “when online” / play / cover / flip / lyrics-network gate is wrong until reachability ignores the browser flag.

Stage 02 is independent of companions and unblocks the stutter without waiting on IDB/OPFS work. It follows 01 only by impact (connectivity is the larger gym failure).

Stage 03 depends on 01 only in that companion fetches should report success through the new `apiFetch` path where they use it; it can ship after 01 so a live artist/lyrics GET cannot be vetoed mid-download. It writes the payload new downloads need.

Stage 04 depends on 03’s ensure/persist helpers and 01’s online signal. It exists so the already-downloaded gym library catches up.

Stage 05 depends on 03’s artist-full files and catalog flags (04 helps existing rows). Flip UI is last among product stages so it reads a real local full, not a thumb.

Stage 06 depends on 01–05 paths and rules matching the code. Living docs only.

## Out of scope

- CD lyrics / Yellow Book local lyrics
- Changing `JOIN_HOLD_MS` (8s) or the 1s → 8s backoff table
- Failing a download job because a companion miss
- Flipping from an artist thumb when full is missing
- Android-only or OPFS-only implementations
- New download-manager UI for companion backfill
- Persist `pending` / `error` lyrics

## Assumptions

- Chrome Android PWA `navigator.onLine` can be false while same-origin `fetch` succeeds (and the inverse). Other Chromium clients can hit the same gate.
- `GET /api/tracks/{id}/lyrics` is a cheap server-cache read (never 404 for “no lyrics”).
- `GET /api/artist-image` placeholder uses `Cache-Control: no-store`; real portraits use `private, max-age=86400`.
- IndexedDB artist/album records can grow extra fields without an IDB version bump (no new object store).
- Radio Tune-in already passes `offline: false` while the tuner socket is up; it only needs the shared rejoin floor.
