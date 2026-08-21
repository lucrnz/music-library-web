**Archive.** Decisions in this file were current as of 2026-08-20 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Now-playing cover flip

## Goal

On the large now-playing cover (mobile expanded sheet, desktop expanded panel, radio room), tap or keyboard flips the card in 3D to the album artist’s photo and back. Mini and compact-bar covers keep tap-to-open. Flip is a visual peek only: it is off while the server is unreachable, and it never changes how artist pictures are fetched or stored.

## Settled decisions

- **Large cover only.** Flip on the expanded on-demand sheet/panel and the radio room. Mobile mini and desktop compact-bar covers still expand now-playing or navigate to `/radio`.
- **Album artist.** Back face is `primaryArtistIdOf` (`albumArtistId`, else `artistId`). The sentinel `_unknown` is not an artist id.
- **No photo, no flip.** Tap is a no-op unless a real artist photo is confirmed. No placeholder flip. No downloads OPFS thumb fallback.
- **Confirm via existing `GET /api/artists/{id}`.** Eligible when `has_image` or `has_preferred_image`. Use `preferred_rev` on `artistImageUrl(..., "full")`. Session-cache successful payloads per artist id. Do not cache offline / network failures as “no photo”.
- **Server unreachable disables the feature.** `canReachServer()` false (`offline` or `server_down`, or the browser is offline) → not a toggle, no artist GET. Coming back online retries resolve and can enable the flip.
- **Peek lifetime.** Showing the artist face is not a preference. Any new `trackId`, collapse (`expanded` false), unmount, or leaving the surface returns to the album. Opening lyrics does not unflip; lyrics keep their own taps; flip is blocked while the overlay is open.
- **Back face.** Same square, radius, and shadow as the album cover. Photo only — no name overlay.
- **Motion.** Horizontal `rotateY` ~500ms ease. `prefers-reduced-motion: reduce` swaps faces instantly with no 3D. Ignore taps mid-animation.
- **When tap is live.** After metadata says there is a photo, the cover is a button (Enter/Space, `aria` reflects album vs artist). Preload `size=full` in the background. A rare early tap may still flip while the back image finishes loading. Hidden from the tab order when lyrics are open or flip is not allowed.
- **Shared surface.** Implement in `NowPlayingView` so on-demand and radio room share one card. The view still does not import `player.ts` or `radio.ts`.
- Living system docs record the behavior. No ADR. Scan, providers, preferred-image storage, and track JSON stay unchanged.

## Design

Collapsed / compact now-playing already treats the cover wrap as an open target (`role="button"` → `cover-or-meta-open`). Expanded cover click is a no-op today. Lyrics sit in `.full-cover-wrap` above `.full-cover` and dim the image.

The flip is a second face on that same wrap, only when `expanded` is true. Compact markup may gain a thin wrapper but must keep `.full-cover` / `.full-cover-wrap` so `player.css` and `desktop.css` (64px compact, 320px desktop expanded, 420px mobile/radio) still size the album image. 3D transforms apply only while expanded.

Eligibility is a small module the view calls: given the current track and `canReachServer()`, either “not flippable” or `{ artistId, imageUrl }`. The view watches `track` / `trackId` / connectivity, drops stale `fetchArtist` results, and preloads the URL. If the artist `img` errors after we thought there was a photo, snap to the album face and disable flip for that artist until a later successful resolve.

`NowPlayingFull` and `RadioNowPlaying` already pass `track`, `trackId`, `expanded`, `lyricsOpen`, and `coverFull`. Radio room is `expanded` true; compact radio is not. No new props are required unless the eligibility helper needs a test seam that stays inside the view.

## Stage map

1. **Eligibility helper** — the gate is independent of CSS. Tests can lock “no id / unreachable / no flags / preferred-only / cache / do not cache network errors” before any chrome moves.
2. **Flip card in `NowPlayingView`** — depends on the helper. One markup/CSS change covers on-demand expanded and radio room. Compact/mini behavior stays the existing open-target path.
3. **Living docs** — after the card exists, playback / radio / frontend conventions describe the peek instead of an always-inert expanded cover.

## Out of scope

- CD / album back-cover art
- Changing artist-image scan, providers, preferred storage, or `GET /api/artist-image`
- Adding `has_image` (or similar) to the track payload
- Flip on mobile mini or desktop compact bar
- Cycling multiple credited artists
- Persisting flipped state
- Artist name (or any caption) on the back face
- Downloads-catalog thumbs as an offline flip path
- Vue component mount tests (project has no happy-dom now-playing runner)
- A same-session preferred-photo upload enabling flip without a new artist resolve

## Assumptions

- `canReachServer()` is the right unreachable gate (matches lyrics network allow); optimistic boot `online` may attempt `fetchArtist` once and then disable on failure.
- Session cache of successful artist payloads is enough; remount or a new artist id refetches.
- Class names `.full-cover-wrap` and `.full-cover` remain the sizing hooks for compact and expanded CSS.
- Radio room cover sizing already comes from `player.css` via the same view; no parallel radio card.
- `primaryArtistIdOf` returning `_unknown` must not call `GET /api/artists/_unknown`.
