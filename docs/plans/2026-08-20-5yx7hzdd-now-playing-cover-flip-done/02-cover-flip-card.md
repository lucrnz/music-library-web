# Stage 02: Cover flip card

## Status
done

## Description

Turn the expanded now-playing cover into a two-face 3D card. When stage 01 says the album artist has a photo and the server is reachable, tap / Enter / Space flips album ↔ artist. Lyrics, compact bar, mini, and tap-to-open stay as they are.

## Rationale

On-demand expanded and radio room already share `NowPlayingView`. Putting the card there is the only way all three large surfaces stay identical without a second radio implementation.

## Invariants

- `NowPlayingView` still does not import `player.ts` or `radio.ts`.
- `expanded === false`: cover wrap remains the open target (`cover-or-meta-open`). No flip, no 3D, no extra tab stop. Compact 64px sizing in `desktop.css` still applies to `.full-cover`.
- `expanded && lyricsOpen`: overlay stays above the card and keeps pointer events. Flip does not start. Current face stays (lyrics do not force the album).
- Flip enabled only when `expanded && !lyricsOpen && resolveCoverFlip.ok`.
- Peek: `showingArtist` resets to false when `trackId` changes, `expanded` becomes false, or the view unmounts.
- Mid-flip pointer/keyboard is ignored until the 500ms transition ends (or immediately when reduced-motion).
- Artist `img` error: show album, treat as not flippable until a later successful resolve.
- Class names `.full-cover-wrap` and `.full-cover` remain the hooks `player.css` / `desktop.css` / `radio.css` already use.

## Risks

- A wrapper around `.full-cover` that also carries width/aspect can fight `#player.expanded .full-cover { width: min(100%, 320px) }` and `#player:not(.expanded) .full-cover { 64px }`.
- `transform` on the wrap would break the compact-bar hover `scale(1.03)` and sheet layout. Keep 3D on an inner card, and only when expanded.
- Preload + two `<img>` tags can decode a large full artist image on every track. Only set the back `src` (and preload) after eligibility is `ok`.

## Implementation

### Files

- `frontend/src/components/player/NowPlayingView.vue`
- `frontend/css/player.css`
- `frontend/css/desktop.css` (only if compact/expanded cover selectors must mention the new inner card; prefer rules that still target `.full-cover`)
- `frontend/css/radio.css` (only if `#view-radio` cover sizing breaks; prefer no change)

### Steps

1. In `NowPlayingView`, watch `track`, `trackId`, `expanded`, and `connectivity.state` (store mirror is allowed; do not import `radio.ts` / `player.ts`). When `expanded` and `canReachServer()`, `resolveCoverFlip(track)`. Ignore stale results when `trackId` changed.
2. On `ok`, preload the image URL (`new Image()` or an off-DOM `Image`). Expose `flipAllowed` only after `ok`. Keep the album `<img class="full-cover">` as the front face; add a back `<img class="full-cover">` with the artist URL only when `ok`.
3. Local `showingArtist` boolean. Toggle on wrap click / Enter / Space only when `flipAllowed && !lyricsOpen && !animating`. Do not emit `cover-or-meta-open` for that path. Collapsed wrap still emits `cover-or-meta-open` only.
4. Accessibility when flip is allowed and lyrics are closed: `role="button"`, `tabindex="0"`, `aria-label` “Show artist photo” / “Show album cover”, `aria-pressed` true on the artist face. When lyrics open or flip is not allowed and `expanded`, no button role (today’s inert expanded cover).
5. CSS: inner card `perspective` + `transform-style: preserve-3d`; flipped state `rotateY(180deg)` ~500ms ease; faces `backface-visibility: hidden`; back face pre-rotated 180deg. Both faces fill the same square (radius 12px, existing shadow on the card or the visible face). `@media (prefers-reduced-motion: reduce)`: no transition, no perspective — swap visibility or skip the rotate.
6. Lyrics dim rule (`.full-cover-wrap.lyrics-open .full-cover`) must still dim whichever face is up.
7. Compact: do not add `perspective` / `rotateY` under `#player:not(.expanded)`. Hover scale on `.full-cover-wrap.is-open-target` stays.
8. Reset `showingArtist` and animation lock in the `trackId` / `expanded` watchers. Clear back `src` when eligibility becomes not-ok (unreachable, new track without a photo).

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test` — `coverFlip` tests still pass; no new Vue mount tests.
- Browser, on-demand, mobile viewport: expand sheet. Cover without a confirmed artist photo does nothing. With a photo, tap flips ~500ms to the artist, tap again returns to the album. Open lyrics: taps do not flip; close lyrics: same face as before. Collapse and re-expand: album face. Next track: album face. Keyboard: Tab to cover, Space/Enter toggles only when flip is allowed.
- Browser, on-demand, desktop ≥900px: same on the expanded right panel. Compact bar cover still opens/expands; no flip; 64px size and hover scale unchanged. Mini cover still expands.
- Browser, radio: room cover flips the same way. Compact radio bar and `RadioMini` still navigate to `/radio`.
- Toggle OS/browser “reduce motion”: faces swap with no 3D.
- Go offline or stop the API: cover stops being a toggle (even if it flipped a moment ago, further taps do nothing and the next expand/reset shows album). Come back online: after resolve succeeds, flip is allowed again.

## Acceptance

- Large on-demand and radio-room covers flip to the album artist photo when eligible; they do not when they are not.
- Mini, compact bar, lyrics overlay, and tap-to-open behavior are unchanged.
- Unreachable server disables the toggle until `canReachServer()` is true again.
- Reduced-motion users get an instant swap, not a 3D spin.
- `NowPlayingView` still has no `player.ts` / `radio.ts` import.
