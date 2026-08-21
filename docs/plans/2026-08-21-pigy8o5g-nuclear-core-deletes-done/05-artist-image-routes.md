# Stage 05: Artist-image routes out of media.py

## Status
done

## Description

Move `GET` / `POST` / `DELETE` `/api/artist-image` from `routes/media.py` into `routes/artist_images.py` and include that router from `api.py`. Cover and stream stay in `media.py`.

## Rationale

`media.py` is a feature bag. Preferred-image CRUD belongs with `artist_images.preferred`, not with stream/prepare.

## Invariants

- Paths, query params, status codes, and response bodies for `/api/artist-image` do not change.
- Cover lazy-fill and `album.has_cover` writes stay in `media.py`.
- Scanned vs preferred pick stays `pick_artist_image_path` + `reconcile_artist_image_flags`.

## Risks

- Moving handlers without including the new router 404s the endpoints.
- Placeholder / cache headers must stay identical (`private, max-age=86400` vs `no-store`).

## Implementation

### Files

- `src/musicweb/routes/artist_images.py`
- `src/musicweb/routes/media.py`
- `src/musicweb/routes/api.py`

### Steps

1. Create `src/musicweb/routes/artist_images.py` with the three artist-image handlers currently in `src/musicweb/routes/media.py` (`GET` / `POST` / `DELETE` `/api/artist-image`). Use `deps.artist_image_store` (already `WebpAssetStore` after stage 01), `preferred_artist_image_store`, `pick_artist_image_path`, `reconcile_artist_image_flags`, `apply_preferred_upload`, `revert_preferred`, and `artist_dict`. Copy placeholder WebP + cache-header behavior from media (import `placeholder_webp` from `musicweb.cover` or `musicweb.images`). Prefix stays `/api`.
2. Delete those three handlers and now-unused artist-image imports from `src/musicweb/routes/media.py`. Leave stream, prepare, forget, codecs, exclusive-formats, and cover.
3. In `src/musicweb/routes/api.py`, `include_router` the new module next to `media`.
4. Do not add a second product path. Existing preferred-upload unit tests keep their URLs if they already hit HTTP; do not edit them unless a broken import appears after the move.

### Verify

- `uv run pytest tests/artist_images/ tests/test_diag_media.py`
- `rg -n "artist-image|apply_preferred_upload|revert_preferred" src/musicweb/routes/media.py` is empty
- `rg -n "include_router\\(.*artist_images" src/musicweb/routes/api.py` matches

## Acceptance

- Artist-image HTTP lives only in `routes/artist_images.py`.
- `/api/artist-image` GET/POST/DELETE behavior is unchanged.
- `media.py` no longer imports preferred-upload helpers.
