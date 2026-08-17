# Stage 02: Upload and revert API

## Status
done

## Description

Add `POST /api/artist-image` and `DELETE /api/artist-image` that write or remove the preferred `WebpAssetStore` only. Validate size and decode through the existing WebP encode path. Return the updated `artist_dict` so the client can cache-bust without a second list fetch.

## Rationale

The cropper and offline flush need a single write/revert contract. Validation and rev bump live in a FastAPI-free helper so they can be unit-tested without `create_app`.

## Invariants

- POST/DELETE never write, delete, or rewrite `covers/artists/` or scan columns (`has_image`, `image_source`, `image_status`, `image_fetched_at`, `mbid`).
- Empty body, undecodable bytes, or a source larger than `ARTIST_IMAGE_MAX_BYTES` (8 MiB) do not bump `preferred_rev` and do not leave partial files (`WebpAssetStore` already writes via `.partial`).
- Successful POST: both preferred WebP files exist, `has_preferred_image` is true, `preferred_rev` increases by 1.
- Successful DELETE when an override exists: preferred files gone, `has_preferred_image` false, `preferred_rev` increases by 1. That rev bump is the client cache key after revert (`artistImageUrl` appends `&rev=` on any nonzero `preferred_rev`, including when `has_preferred_image` is false). DELETE when none exists is 200 with the current dict and does not bump rev.
- Unknown `artist_id` → 404. No auth.
- `PreferredImageTooLarge` and `PreferredImageUndecodable` subclass `Exception`, not `ValueError` (global handler would force 400). `media.py` catches them and raises `HTTPException` 413 / 400. They are not added to `main.py` `_EXCEPTION_STATUS`. Helpers do not import FastAPI.
- Tests do not boot the app; they call the helper with a tmp `WebpAssetStore` + ORM instance.

## Risks

- Multipart field name and query vs form `artist_id` will drift from the SPA if not named once. Lock `artist_id` as query (same as GET) and the file field as `file`.
- An uncaught preferred exception becomes 500. The route must catch both types.

## Implementation

### Files

- Create: `src/musicweb/artist_images/preferred.py` (`apply_preferred_upload`, `revert_preferred`, `PreferredImageTooLarge`, `PreferredImageUndecodable`)
- Create: `tests/artist_images/test_preferred.py`
- Change: `src/musicweb/routes/media.py` (POST + DELETE; catch the two exceptions → `HTTPException`)
- Do not change: `src/musicweb/routes/deps.py` (stage 01 already returns the preferred `WebpAssetStore`)

### Steps

1. `PreferredImageTooLarge(Exception)` and `PreferredImageUndecodable(Exception)` in `preferred.py`.
2. `apply_preferred_upload(store: WebpAssetStore, artist, data: bytes) -> Artist`: if `len(data) > ARTIST_IMAGE_MAX_BYTES` raise `PreferredImageTooLarge`; if empty or `store.write_from_bytes` is false raise `PreferredImageUndecodable`; else set `has_preferred_image=True`, `preferred_rev += 1`.
3. `revert_preferred(store: WebpAssetStore, artist) -> Artist`: if not `has_preferred_image` and not `store.has(artist.id)`, no-op (no rev bump). Otherwise `store.delete`, `has_preferred_image=False`, `preferred_rev += 1`.
4. POST `/api/artist-image?artist_id=`: read upload `file`, cap by content-length and by bytes read, run helper, catch the two types → 413 / 400, return `artist_dict`. Zero extra commits. `get_db` is the only commit.
5. DELETE `/api/artist-image?artist_id=`: run helper, return `artist_dict`. Zero extra commits.
6. Tests: tiny valid PNG/JPEG bytes (Pillow in the test, no fixture binaries) → files + flags + rev 1; second POST → rev 2; oversized → `PreferredImageTooLarge`, no files, rev 0; garbage bytes → `PreferredImageUndecodable`; revert → files gone, flag false, rev bumped; revert twice → rev unchanged the second time; scan columns on the same `Artist` instance stay put.

### Verify

```sh
uv run --group dev pytest tests/artist_images/test_preferred.py tests/artist_images/test_resolve.py tests/artist_images/test_preferred_scan_isolation.py
```

## Acceptance

- [ ] POST writes only `covers/artists-preferred/` and increments `preferred_rev`.
- [ ] DELETE removes only that pair and increments `preferred_rev` once (rev still bumped when `has_preferred_image` becomes false).
- [ ] Oversize raises `PreferredImageTooLarge`; undecodable raises `PreferredImageUndecodable`; neither mutates disk or rev.
- [ ] `preferred.py` does not import FastAPI. `main.py` `_EXCEPTION_STATUS` is unchanged.
- [ ] Scan metadata on the artist row is unchanged after upload and revert.
- [ ] Response body is `artist_dict` including the new flags.
- [ ] Routes add no extra `session.commit()`. `get_db` is the only commit.
