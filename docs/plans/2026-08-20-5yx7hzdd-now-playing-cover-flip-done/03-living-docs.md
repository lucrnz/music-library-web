# Stage 03: Living docs

## Status
done

## Description

Record the cover-flip peek on the now-playing pages that already describe the shared `NowPlayingView` surface. `context/design.md` is not living documentation.

## Rationale

The next now-playing change will assume the expanded cover is still inert. Playback, radio, and frontend conventions are the pages that already specify cover tap, lyrics overlay, and the shared view.

## Invariants

- Do not treat this plan’s `context/design.md` as the long-term spec.
- Do not add an ADR. This is chrome behavior, not a new storage or fetch pipeline.
- Do not document a second radio-only card.

## Risks

- A conventions note that says “tap the cover to flip” without “expanded / room only” will be read as applying to the mini and compact bar.

## Implementation

### Files

- `docs/systems/playback.md`
- `docs/systems/radio.md`
- `docs/frontend/conventions.md`

### Steps

1. In `playback.md`, near the now-playing / radio-reuse paragraph: the **expanded** cover (mobile sheet, desktop panel) can 3D-flip to the album-artist photo when `GET /api/artists/{id}` reports `has_image` or `has_preferred_image` and `canReachServer()` is true. Peek: reset on track change, collapse, unmount. Lyrics overlay blocks the flip and does not change the face. Unreachable server disables the feature. Mini / compact covers are unchanged open-targets.
2. In `radio.md` **Client**: the room cover is the same peek (shared `NowPlayingView`). Compact bar and `RadioMini` covers still only navigate to `/radio`.
3. In `frontend/conventions.md` UX conventions, after the now-playing / artist-photo-menu bullets: now-playing does **not** grow a photo menu; the expanded/room cover flip is the only now-playing artist-photo surface. It uses `fetchArtist` + `artistImageUrl` (`size=full`, `preferred_rev`). It does not add photo items to `nowPlayingMenuItems`.

### Verify

- Grep `docs/` (exclude `docs/plans/`) for “cover flip”, “artist photo”, and “tap the cover”. Remaining living mentions must say expanded/room only and the unreachable gate.
- No living page still says the expanded cover is inert / decoration-only.

## Acceptance

- A reader of `playback.md`, `radio.md`, and `frontend/conventions.md` can predict: where it flips, which artist, when it refuses, and that mini/compact/lyrics are unchanged.
- Scan / preferred-image / track-payload docs are untouched.
