# Stage 03: Download art, artist full, and lyrics

## Status
done

## Description

When a track download finalizes, also store album thumb+full (already attempted), the album-artist / track-artist **full** photo when the artist API says there is one, flip eligibility flags, and lyrics (`ok` / `instrumental` / `not_found`). A companion miss does not fail the audio job. Now-playing re-resolves covers when album art lands.

## Rationale

New downloads must be gym-complete. Flip and lyrics UI cannot read files this stage never writes. Re-resolving covers fixes the play-before-art-finishes race.

## Invariants

- Audio catalog row is committed before companions; a companion throw or miss leaves the track `ready`.
- `/api/artist-image` placeholder (`Cache-Control: no-store`) is not stored as `hasThumb` / `hasFull`.
- VA (`isVa`) stores flags and does not download a portrait file.
- Lyrics IDB writes `ok`, `instrumental`, and `not_found` only. `pending` / `error` are not written.
- `writer.ts` does not import `playerSession.ts` or `player.ts`.
- Artist pins stay album-artist + track-artist (`artistIdsOf` / `pinArtistIdsOf`).

## Risks

- Fetching lyrics and artist JSON per finalize adds LAN traffic next to the audio GET; keep it sequential after audio, not inside the stream write.
- Detecting placeholder only via `Cache-Control` is brittle if the server header changes — also require `hasImage` / `hasPreferredImage` before fetching bytes.
- Publishing a new blob URL without revoking the previous `artUrlCache` entry leaks blob URLs.

## Implementation

### Files

- `frontend/src/downloads/art.ts`
- `frontend/src/downloads/writer.ts`
- `frontend/src/downloads/catalog.ts`
- `frontend/src/downloads/migrate.ts`
- `frontend/src/downloads/snapshot.ts`
- `frontend/src/lyrics/cache.ts`
- `frontend/src/stores/playerSession.ts`
- `frontend/tests/downloads/`
- `frontend/tests/downloads/art.test.ts`
- `frontend/tests/lyrics/peekLyricsMemory.test.ts`
- `frontend/tests/stores/playerSession.test.ts`

### Steps

1. Extend `CatalogArtistRecord` in `frontend/src/downloads/writer.ts` with `hasFull`, `fullBytes?`, `hasImage`, `hasPreferredImage`, `isVa`, `preferredRev`. Create rows with those false/0. On delete/wipe/`artFileSpecsFromRecords`/`sumDownloadedBytes`, treat artist full like album full (`artistCoverFileName(id, "full")`, `artistArtBlobKey(id, "full")`, revoke `artist:${id}:full`).
2. In `frontend/src/downloads/art.ts`, add `ensureArtistPhoto(artistId)`: `fetchArtist(id)`; persist flags onto the existing artist row; if `isVa` or neither `hasImage` nor `hasPreferredImage`, do not fetch image bytes; else `fetchArtIfMissing` for `size=full` (and thumb if `!hasThumb`) using `/api/artist-image?...`. If the image response is placeholder (`Cache-Control` contains `no-store`), treat as miss. Do not import `@/components/player/coverFlip`. Teach `getLocalArtistImageUrl` to honor `full` the same way `getLocalCoverUrl` falls back between sizes. Export `onArtFilesChanged(fn)` / notify after a successful album or artist file write (no player imports).
3. Replace `ensureArtistArtFile` call sites in `refreshCatalogArt` with `ensureArtistPhoto`. Keep `ensureAlbumArtFiles`. After the IDB flag write, call the art-files listener with the album id when album art changed.
4. In `frontend/src/lyrics/cache.ts`, persist `not_found` as well as `ok` / `instrumental` when the track is in the catalog. When `allowNetwork` is true and the IDB/memory payload is `not_found`, hit `fetchLyrics` again and replace the row. Export `cacheLyricsForDownload(trackId)` used by `refreshCatalogArt` / finalize: `fetchLyrics` + persist per that rule; swallow errors.
5. Call `cacheLyricsForDownload(n.id)` from `refreshCatalogArt` (or immediately after it in `finalizeTrackDownload`) so lyrics ride the same best-effort pass. Re-export any new art helpers from `frontend/src/downloads/catalog.ts` that stage 04/05 will import (`ensureArtistPhoto`, `onArtFilesChanged`, `getLocalArtistImageUrl` already exported).
6. In `frontend/src/stores/playerSession.ts` `initPlayerSession`, subscribe `onArtFilesChanged` so a matching current album invalidates `lastCoverTrackId` and calls `updateMediaSession`. In `frontend/src/downloads/migrate.ts`, copy artist `full` leftovers the same way as album `full`.
7. Add `frontend/tests/downloads/art.test.ts`: flags-false skips image fetch; `isVa` skips bytes; `no-store` response does not set `hasFull`; `getLocalArtistImageUrl(..., "full")` returns a blob URL when `hasFull`. Extend `frontend/tests/lyrics/peekLyricsMemory.test.ts` for persist `not_found` and online revalidate. Extend `frontend/tests/stores/playerSession.test.ts` so an art-files notify after a placeholder resolve paints a local cover when `resolveCoverUrl` would now hit.

### Verify

- `pnpm --dir frontend test -- frontend/tests/downloads/art.test.ts frontend/tests/lyrics/peekLyricsMemory.test.ts frontend/tests/stores/playerSession.test.ts frontend/tests/downloads/migrate.test.ts frontend/tests/downloads/storageInfo.test.ts` passes.
- `rg -n "from \\\"@/stores/player|from '@/stores/player" frontend/src/downloads/writer.ts frontend/src/downloads/art.ts` is empty.
- `rg -n "ensureArtistArtFile" frontend/src/downloads/writer.ts` is empty (writer uses `ensureArtistPhoto`).

## Acceptance

- Finalizing a download while online writes lyrics IDB for `ok` / `instrumental` / `not_found` and, when the artist has a real portrait, an artist `full` file plus flags.
- A missing portrait or missing lyrics leaves the audio row `ready`.
- Playing the track before album art finishes, then art landing, updates `player.coverFull` / `coverThumb` without another play tap.
