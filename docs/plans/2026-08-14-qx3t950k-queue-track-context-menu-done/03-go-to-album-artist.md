# Stage 03: Go to album / artist

## Status
done

## Description

Prepend **Go to album** and **Go to artist** in the queue builder. Each item’s `run()` closes (already done by the picker) then `router.push` the existing library route. Hide each row when its id is missing.

## Rationale

These are new capabilities from the queue. They do not depend on downloads, but they do depend on `run()` and on the picker already closing before navigation.

## Invariants

- Library album/artist routes and `LibraryView` loaders are unchanged.
- `artistId` only — never fall back to `albumArtistId`.
- No toast on navigate.
- Mobile navigation leaves the Queue tab (`pane: "library"`). That is intended.
- Desktop dual-pane: queue stays visible; the library pane follows the route.
- Download family and Remove are unchanged.

## Risks

- Pushing `downloads-album` / `downloads-artist`. Always `name: "album"` / `name: "artist"`.
- Showing Go to artist when only `albumArtistId` is set — hide.
- A card left up across a tab switch. Stage 01 already requires `PlaylistView` to close on `route.fullPath`.

## Implementation

### Files

- Change `src/musicweb/templates/index.html` (`#i-album`, `#i-artist`)
- Change `src/musicweb/static/js/components/playlist/queueMenuItems.js`

### Steps

1. Add two 24×24 symbols consistent with the existing sprite.
2. Builder prepends, when ids exist:
   - `{ id: "go-album", label: "Go to album", icon: "album", run → router.push({ name: "album", params: { albumId } }) }` if `track.albumId`
   - `{ id: "go-artist", label: "Go to artist", icon: "artist", run → router.push({ name: "artist", params: { artistId } }) }` if `track.artistId`
3. Final order: Go to album → Go to artist → Download family → Remove from queue.
4. Missing track with an album/artist id: still show Go to… (catalog identity is useful). Download remains hidden per stage 02.
5. No `PlaylistView` switch and no new store. If `queueMenuItems` needs `router`, import it there.

### Verify

- `uv run --group dev pytest`
- `uv run musicweb`:
  - **<900px** on `/queue`: Go to album lands on `/albums/:id`, Queue tab is no longer selected, library shows that album, menu is gone. Queue tab returns to the queue.
  - **≥900px**: same route change; queue pane stays on screen; library pane shows the album/artist.
  - No `artistId`: no Go to artist.
  - No `albumId`: no Go to album.
  - Compilation: track artist, not album artist.
  - Download and Remove still present and last.

## Acceptance

- [ ] Go to album / Go to artist sit above download and remove.
- [ ] Each row is omitted when its id is null.
- [ ] `run()` uses `album` / `artist` route names only.
- [ ] No toast. Menu is not visible after navigate.
- [ ] Mobile leaves the Queue tab; desktop keeps the queue pane.
- [ ] Artist target is `artistId`, not `albumArtistId`.
- [ ] `PlaylistView` still has no action-id switch.
