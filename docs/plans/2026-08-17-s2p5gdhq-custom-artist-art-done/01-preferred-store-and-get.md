# Stage 01: Preferred store and GET priority

## Status
done

## Description

Add a second `WebpAssetStore` root for operator-preferred portraits and make `GET /api/artist-image` return that file when it exists. Add `has_preferred_image` and `preferred_rev` on `artists` and in `artist_dict`. Scan and `regen-artist-images --force` continue to delete and rewrite only the scanned store.

## Rationale

Every later stage assumes one HTTP URL that already prefers the override. Isolating the directory (not a second wrapper class) is what makes force-regen safe without cloning `ArtistImageStore`.

## Invariants

- Preferred files live under `$MUSICWEB_DATA_DIR/covers/artists-preferred/{artist_id}.{full|thumb}.webp`. They are never written under `covers/artists/`.
- There is no `preferred_artist_image.py` and no `PreferredArtistImageStore`. Preferred I/O is `WebpAssetStore` (`has` / `get_path` / `write_from_bytes` / `delete`).
- Placeholders are never persisted in either store. Missing preferred files must not set `has_preferred_image`.
- `ArtistImageFetcher`’s constructor is unchanged. `fetch_one(..., force=True)` deletes and refetches only the scanned store. It does not receive a preferred store, does not delete preferred files, and does not clear `has_preferred_image` / `preferred_rev`.
- `jobs/runner.py` is not given a preferred store.
- `has_image` / `image_source` / `image_status` remain scan-only.
- Artist JSON stays snake_case. New keys are `has_preferred_image` (bool) and `preferred_rev` (int, default 0).
- Honesty rules live in `reconcile_artist_image_flags`, not inline in the FastAPI handler. Two independent `if`s; both flags may clear on one GET. Flag honesty uses `preferred.has(id)` / `scanned.has_image(id)`. Serve uses size-specific `get_path` / `image_path`. GET never sets `has_preferred_image`. No `create_app` / TestClient.
- GET mutates the `get_db` session and relies on the existing success-commit. Do not add a second session or a manual commit.

## Risks

- Deriving `preferred_has` from `get_path(size) is not None` would clear the flag when only one size is missing. Use `has()` / `has_image()`.
- `RuntimeServices` only holds one artist store today. Hold the preferred `WebpAssetStore` as its own field; do not stuff it into the fetcher.

## Implementation

### Files

- Create: `src/musicweb/artist_images/resolve.py`
- Create: `src/musicweb/db/migrations/versions/008_preferred_artist_image.py`
- Create: `tests/artist_images/test_resolve.py`
- Create: `tests/artist_images/test_preferred_scan_isolation.py`
- Change: `src/musicweb/db/models.py` (`Artist.has_preferred_image`, `Artist.preferred_rev`)
- Change: `src/musicweb/routes/serializers.py` (`artist_dict`)
- Change: `src/musicweb/routes/media.py` (GET gathers paths, calls pick + reconcile, serves)
- Change: `src/musicweb/routes/deps.py` (`preferred_artist_image_store` → `WebpAssetStore`)
- Change: `src/musicweb/runtime/bootstrap.py` (construct `WebpAssetStore(data_dir / "covers" / "artists-preferred")`)
- Change: `src/musicweb/main.py` (copy that store onto `app.state`)
- Change: `tests/routes/test_serializers.py` (lock the two new keys)
- Do not change: `src/musicweb/artist_images/fetch.py` constructor or `src/musicweb/jobs/runner.py`

### Steps

1. Add Alembic `008_preferred_artist_image` revising `007_track_lossy_and_album_kind`. `ADD COLUMN` `has_preferred_image` boolean not null default false and `preferred_rev` integer not null default 0. Avoid a full artists table rebuild (same note as `004_artist_images.py`).
2. Bootstrap `WebpAssetStore(data_dir / "covers" / "artists-preferred")`. Expose it via `deps.preferred_artist_image_store`. Do not add a wrapper type.
3. `pick_artist_image_path(preferred: Path | None, scanned: Path | None) -> Path | None`: return preferred if not None, else scanned, else None.
4. `reconcile_artist_image_flags(artist, preferred_has: bool, scanned_has: bool) -> None` — two independent `if`s:

   ```python
   if artist.has_preferred_image and not preferred_has:
       artist.has_preferred_image = False
   if artist.has_image and not scanned_has:
       artist.has_image = False
   ```

   Callers pass `preferred.has(id)` and `scanned.has_image(id)`, not path-for-size.
5. GET `/api/artist-image`: 404 unknown artist unchanged. Reconcile using `has` / `has_image`. Then `pick_artist_image_path(preferred.get_path(id, size), scanned.image_path(id, size))`. Serve the picked path as `image/webp` with today’s real-art cache headers; else placeholder `no-store`. If preferred files exist and `has_preferred_image` is false, still serve them — do not set the flag. Leave commit to the existing `get_db` success path.
6. `artist_dict` includes `has_preferred_image` and `preferred_rev`.
7. Isolation test: write a preferred pair with `WebpAssetStore` on a tmp data dir, construct `ArtistImageFetcher` exactly as today, `force=True` with providers patched to miss, assert preferred files and `has_preferred_image` / `preferred_rev` remain. Do not pass the preferred store into the fetcher.
8. Do not add POST/DELETE in this stage.

### Verify

```sh
uv run --group dev pytest tests/artist_images/test_resolve.py tests/artist_images/test_preferred_scan_isolation.py tests/routes/test_serializers.py tests/jobs/test_runner.py
uv run --group dev pytest
```

## Acceptance

- [ ] Preferred files persist under `covers/artists-preferred/` and are ignored by force regen / full scan fetch.
- [ ] No `PreferredArtistImageStore` / `preferred_artist_image.py` exists.
- [ ] `pick_artist_image_path` returns preferred, then scanned, then `None`.
- [ ] `reconcile_artist_image_flags` tests: preferred missing clears `has_preferred_image`; scanned missing clears `has_image`; **both** missing clears both. Flag inputs come from `has()` / `has_image()`, not `get_path`.
- [ ] GET does not set `has_preferred_image` when files exist and the flag is false. Keep this as an invariant (and/or a helper-contract test). Do not add a TestClient GET.
- [ ] `artist_dict` exposes `has_preferred_image` and `preferred_rev` without dropping existing keys.
- [ ] Placeholders still never hit disk.
- [ ] `ArtistImageFetcher` constructor and `jobs/runner.py` are unchanged.
