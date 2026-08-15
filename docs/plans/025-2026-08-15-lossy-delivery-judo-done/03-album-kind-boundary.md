# Stage 03: Album kind and API boundary

## Status
done

## Description

Normalize albums at the fetch boundary (`fromApiAlbum` / `mapAlbums`). `kindForAlbum` reads `lossyKind` only. Finalize SQL reduces like `kindForTracks` so a single unknown codec is `lossy`, not `mixed`.

## Rationale

`kindForAlbum` currently accepts `lossyKind ?? lossy_kind` because albums never pass a track-style boundary. SQL uses `mixed` for “not exactly one of mp3/aac,” which is a different word than the track generic kind.

## Invariants

- Track kind union unchanged: `mp3 | aac | lossy | null`. A track is never `mixed`.
- Album kind union: `mp3 | aac | mixed | lossy | null`.
- Reduce: no lossy present tracks → `null`; one distinct track-kind → that kind; several → `mixed`.
- `LossyMark` still maps `lossy` and `mixed` to `fmt-lossy`.
- API JSON stays snake_case (`lossy_kind`). Only the client boundary camelCases.
- Offline downloads still use `kindForTracks` (already the same reduce).

## Risks

- `loadAlbumDetail` today reads `album.artist_id || album.artistId`. `fromApiAlbum` must expose `artistId` so that fallback can drop the snake_case half at that call site.
- Albums list and the albums tree still `apiGet` directly. If they are not wired through `mapAlbums`, marks go blank (`kindForAlbum` will no longer see `lossy_kind`).
- SQL change only appears after the next scan finalize. Existing `mixed` rows that should be `lossy` wait until then. Accept.

## Implementation

### Files

- Create `src/musicweb/static/js/models/album.js`
- Change `src/musicweb/static/js/lossyKind.js`
- Change `src/musicweb/static/js/api.js`
- Change `src/musicweb/static/js/components/library/loaders.js`
- Change `src/musicweb/static/js/components/tree/sources/albumsSource.js`
- Change `src/musicweb/scan/finalize.py`
- Change `src/musicweb/templates/index.html` only if `album.js` must be import-mapped (plain relative imports — likely no change)
- Add a focused finalize/kind test if one exists for roll-up; otherwise add `tests/test_album_lossy_kind.py` that runs the SQL reduce against a temp session **or** extract a pure `album_lossy_kind(codecs: list[str]) -> str | None` in `finalize.py` / `scan` and unit-test that. Prefer the pure helper so pytest does not need a full scan.

### Steps

1. Add a pure roll-up helper next to finalize (same module or `scan/lossy_kind.py`): given the present lossy tracks’ `source_codec` values, apply the reduce in design.md. Finalize SQL must match it — either call the helper per album in Python, or keep a SQL `CASE` that implements the same reduce (`mp3`/`aac` as themselves, else `lossy`; then `COUNT(DISTINCT)` → one kind or `mixed`). Prefer SQL that matches the helper’s comments so a rescan does not need per-album Python.
2. `fromApiAlbum`: required `id`; map `title`, `artist`, `artistId` (`artist_id`), `year`, `trackCount` (`track_count`), `hasCover` (`has_cover`), `lossyKind` (`lossy_kind`). `mapAlbums` like `mapTracks` (skip bad rows).
3. Wire: `fetchAlbum` → `fromApiAlbum`; `fetchArtistAlbums` and `fetchSearch.albums` → `mapAlbums`. Add `fetchAlbums()` for `GET /api/albums?limit=500&sort=title` and use it from `loadAlbumsList` and `listAlbumRoots` so those paths stop parsing raw items.
4. `kindForAlbum`: `const raw = album?.lossyKind ?? null`; accept `mp3` / `aac` / `mixed` / `lossy`; else `null`. Delete `lossy_kind`.
5. `loadAlbumDetail`: use `album.artistId` only.
6. Tests for the roll-up helper: `[]` → `None`; `["mp3","mp3"]` → `"mp3"`; `["aac"]` → `"aac"`; `["mp3","aac"]` → `"mixed"`; `["opus"]` / `[None]` → `"lossy"`; `["lossy"]` is not an input (inputs are source codecs).

### Verify

- `uv run --group dev pytest tests/test_album_lossy_kind.py` (or the file you add) plus existing scan tests if any import finalize.
- `rg "lossy_kind" src/musicweb/static/js` — only `fromApiAlbum` (and comments if any). `kindForAlbum` must not mention it.
- `rg "apiGet\\(\"/api/albums" src/musicweb/static/js` — no leftover list fetches that skip `mapAlbums`.
- Inspection: album card / tree still pass `kindForAlbum(album)` and render `LossyMark` for `mp3`/`aac`/`mixed`/`lossy`.

## Acceptance

- [ ] Leaf album UI never reads snake_case.
- [ ] `kindForAlbum` and finalize share one reduce meaning.
- [ ] A single unknown-codec lossy album is `lossy`, not `mixed`.
- [ ] Track kind union and `LossyMark` icon map unchanged.
