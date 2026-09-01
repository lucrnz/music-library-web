# Stage 05: VA Aero portrait, no fetch, cover-flip

## Status
done

## Description

Commit the operator-chosen Aero CD + note as packaged full/thumb WebP. `GET /api/artist-image` always serves it for `VA_ARTIST_ID`. Skip fetch and reject preferred upload. Hide the photo menu and drop-to-crop for VA. Cover-flip on a VA album lands on that note.

## Rationale

VA must never hit MusicBrainz / Last.fm / fanart or a local `artist.jpg`, and the generic gray `placeholder_webp` is not the settled face. Stage 03 already ships `is_va`; this stage is the bytes and the chrome that uses that flag.

## Invariants

- Packaged WebP sizes match `FULL_SIZE` / `THUMB_SIZE` (1000 / 200).
- `GET /api/artist-image?artist_id=<VA>` returns those bytes even when `has_image` is false and no store files exist.
- `POST` / `DELETE /api/artist-image` for VA is 403. Scan/`--force` does not fetch or write store files for VA.
- `covers/artists-preferred/` is never written or deleted for VA.
- Photo items and thumb-drop are off whenever `artist.isVa`.
- Cover-flip treats VA as having a flip photo; `flipImageUrl` is the artist-image URL (the short-circuit serves the note).

## Risks

- Encoding the Pinterest JPEG at plan time must not leave a runtime HTTP dependency on `i.pinimg.com`.
- `includePhoto` is currently a host-wide flag; forgetting a per-artist `&& !isVa` leaves Change photo on the VA card.
- Cover-flip fetches `GET /api/artists/{id}` first; VA has albums so that 200s. Do not require `hasImage`.

## Implementation

### Files

- `src/musicweb/images/assets/va-artist-full.webp`
- `src/musicweb/images/assets/va-artist-thumb.webp`
- `src/musicweb/images/va_portrait.py`
- `src/musicweb/images/__init__.py`
- `src/musicweb/routes/artist_images.py`
- `src/musicweb/artist_images/fetch.py`
- `src/musicweb/scan/artist_images.py`
- `src/musicweb/artist_images/preferred.py`
- `frontend/src/components/library/artistMenuItems.ts`
- `frontend/src/components/library/entityActions.ts`
- `frontend/src/components/library/EntityListHost.vue`
- `frontend/src/components/library/LibraryView.vue`
- `frontend/src/components/library/rows/ArtistCard.vue`
- `frontend/src/components/library/rows/ArtistRow.vue`
- `frontend/src/components/tree/LibraryTreePane.vue`
- `frontend/src/components/player/coverFlip.ts`
- `tests/artist_images/test_va_portrait.py`
- `tests/artist_images/test_preferred.py`
- `frontend/tests/player/coverFlip.test.ts`
- `frontend/tests/library/artistMenuItems.test.ts`

### Steps

1. Fetch `https://i.pinimg.com/736x/60/d2/e4/60d2e4be2a6814af3b5591ca512870aa.jpg` once in the implementation environment. Run it through existing `full_thumb_webp_pair` and commit the two WebPs under `src/musicweb/images/assets/`. Do not fetch that URL from the running server.
2. Add `src/musicweb/images/va_portrait.py` that loads those package files (`importlib.resources`) and returns bytes for `full` / `thumb`. Export from `src/musicweb/images/__init__.py`.
3. In `src/musicweb/routes/artist_images.py` `artist_image`, if `artist_id == VA_ARTIST_ID`, return the packaged WebP (`Cache-Control` may match other portraits). Do not reconcile store flags. In `artist_image_upload` and `artist_image_delete`, 403 when the id is VA.
4. In `src/musicweb/artist_images/preferred.py`, refuse `apply_preferred_upload` / `revert_preferred` for VA (same 403 path, or raise a dedicated error the route maps).
5. In `src/musicweb/artist_images/fetch.py` `needs_fetch` and `fetch_one`, return false / skipped when `artist.id == VA_ARTIST_ID` even if `force`. In `src/musicweb/scan/artist_images.py`, do not enqueue VA (filter `id != VA_ARTIST_ID` in addition to `album_count > 0`).
6. Client: `buildArtistMenuItems` must not add photo items when `artist.isVa`, regardless of `includePhoto`. Gate drop-to-crop and tree/header photo in `entityActions.ts`, `EntityListHost.vue`, `LibraryView.vue`, `ArtistCard.vue`, `ArtistRow.vue`, and `LibraryTreePane.vue` with the same `!artist.isVa` (or stop passing `includePhoto` for that row).
7. In `frontend/src/components/player/coverFlip.ts`, `artistHasFlipPhoto` is true when `artist.isVa` as well as `hasImage` / `hasPreferredImage`. Keep `coverFlipArtistId` as album artist (`primaryArtistIdOf`) so a VA track flips to VA, not the guest.
8. Tests: route GET returns WebP for VA without store files; POST/DELETE 403; `needs_fetch` false under force; preferred helpers refuse; Vitest cover-flip allows VA without `hasImage`; artist menu omits change-photo when `isVa`.

### Verify

- `uv run pytest tests/artist_images`
- `pnpm --dir frontend test -- frontend/tests/player/coverFlip.test.ts frontend/tests/library/artistMenuItems.test.ts`
- `pnpm --dir frontend typecheck`
- Confirm GET `/api/artist-image?artist_id=<VA_ARTIST_ID>&size=thumb` is `image/webp` and not the solid gray placeholder.

## Acceptance

- Various Artists shows the Aero CD + note on the Artists grid, the VA artist page, and now-playing cover-flip. No remote or local fetch runs for that id, including regen `--force`.
- Change artist photo / drop-to-crop / preferred revert are absent and the API rejects them.
- Other artists’ portraits, preferred overrides, and the sacred `covers/artists-preferred/` policy are unchanged.
