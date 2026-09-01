# Stage 03: Artists list, search, and no album-less artist pages

## Status
done

## Description

Publish the VA discovery contract: album-less artists 404, search’s artist bucket resolves aliases to Various Artists, track payloads say whether Go to artist is legal, and the SPA hides that action and treats a 404 artist route as not found.

## Rationale

After remount, VA-only performers still have `artists` rows (`album_count == 0`) for radio and FTS. This stage is what makes “they do not make it to the Artists UI, but their tracks do appear in Search” true at the HTTP and menu layer, including the settled 404 for every album-less artist.

## Invariants

- `GET /api/artists` still returns only `album_count > 0` (VA is included once it owns comps).
- `GET /api/artists/{id}` and `GET /api/artists/{id}/albums` are 404 when missing **or** `album_count == 0`.
- Search tracks remain FTS (VA-only performer names still hit). Search artists include VA when the query folds to an alias.
- `artist_browsable` is true iff the track’s performing `artist_id` owns albums.
- `is_va` is true only for `VA_ARTIST_ID`.
- No appears-on section is added.

## Risks

- Bookmarks to a former alias artist id 404 after remount (accepted).
- `loadArtistDetail` today swallows fetch errors and shows “No albums for this artist”; leaving that copy would look like an empty discography instead of not found.
- Radio now-playing uses `track_dict`; if `artist_browsable` is omitted there, Go to artist on the radio room would be wrong.

## Implementation

### Files

- `src/musicweb/db/repositories/artists.py`
- `src/musicweb/routes/discovery.py`
- `src/musicweb/routes/serializers.py`
- `src/musicweb/routes/radio.py`
- `src/musicweb/radio/types.py`
- `src/musicweb/routes/playlists.py`
- `frontend/src/models/artist.ts`
- `frontend/src/models/track.ts`
- `frontend/src/components/player/nowPlayingMenuItems.ts`
- `frontend/src/components/playlist/queueMenuItems.ts`
- `frontend/src/components/library/loaders.ts`
- `tests/routes/test_serializers.py`
- `tests/routes/test_discovery_va.py`
- `frontend/tests/models/artist.test.ts`
- `frontend/tests/models/track.test.ts`
- `frontend/tests/library/entityMenuItems.test.ts`
- `frontend/tests/playlist/queueMenuItems.test.ts`

### Steps

1. In `src/musicweb/db/repositories/artists.py`, add `ids_with_albums(session, ids) -> set[str]` and `search_by_name` so a query that `is_va_name(q)` includes the VA row (still `album_count > 0`) in addition to the existing `ILIKE` on `name`.
2. In `src/musicweb/routes/discovery.py`, 404 `get_artist` and `artist_albums` when the row is missing or `album_count == 0`.
3. Extend `artist_dict` in `src/musicweb/routes/serializers.py` with `is_va: artist.id == VA_ARTIST_ID`. Extend `track_dict` with `artist_browsable: bool` (required kwarg or computed from a passed set — do not query inside `track_dict`).
4. Every `track_dict` caller in `src/musicweb/routes/discovery.py` (search, album tracks, get track, tracks/meta), `src/musicweb/routes/radio.py` snapshot serialize, and `src/musicweb/routes/playlists.py` must pass `artist_browsable` from `ids_with_albums`.
5. Map `isVa` / `artistBrowsable` in `frontend/src/models/artist.ts` and `frontend/src/models/track.ts` (default `artistBrowsable` false when absent so offline catalog records do not invent pages).
6. In `frontend/src/components/player/nowPlayingMenuItems.ts` and `frontend/src/components/playlist/queueMenuItems.ts`, emit Go to artist only when `track.artistBrowsable` (not merely when `artistId` is set).
7. In `frontend/src/components/library/loaders.ts` `loadArtistDetail`, on artist 404 return the empty kind with message `Artist not found` and no header photo actions; do not call albums after that 404.
8. Tests: serializer `is_va` / `artist_browsable`; new `tests/routes/test_discovery_va.py` for list (VA present, guest absent), get 404 album-less, search query `VA` / `オムニバス` returns the one artist, FTS still returns the guest’s tracks; Vitest for model mapping and both menus.

### Verify

- `uv run pytest tests/routes/test_serializers.py tests/routes/test_discovery_va.py`
- `pnpm --dir frontend test -- frontend/tests/models/artist.test.ts frontend/tests/models/track.test.ts frontend/tests/library/entityMenuItems.test.ts frontend/tests/playlist/queueMenuItems.test.ts`
- `pnpm --dir frontend typecheck`

## Acceptance

- Artists browse shows one Various Artists and no VA-only performers.
- Search for a VA-only performer name returns tracks, not an artist card. Search for `VA` / `オムニバス` returns the Various Artists card.
- Go to artist is absent on a VA-only performer and present on a performer who owns albums (including from a VA compilation track).
- `/artists/{album-less-id}` is a not-found page. `/artists/{VA_ARTIST_ID}` lists compilation albums only.
