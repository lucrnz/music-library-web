# Stage 06: Lyrics overlay (local then LRCLIB)

## Status
done

## Description

Resolve lyrics for a playing Yellow Book row: companion local lyrics, then library-server LRCLIB by title/artist/album/duration. Wire the existing now-playing lyrics overlay. Do not write SQLite or the disc.

## Rationale

Lyrics were in the product ask and need a path that has no `tracks.id`. Local lyrics already exist on the companion after stage 03; network must not wait for a scan.

## Invariants

- Order: sidecar / tags on the disc (companion GET), then LRCLIB. Never write `track_lyrics` or any `tracks` row.
- Cache is in-memory via `peekLyricsMemory` / `remember`, keyed by the `cdrom:` id (and may use `match_fingerprint` on the server only to avoid repeat LRCLIB in-process). Export `dropLyricsMemory(prefix)` from `lyrics/cache.ts`. Do not add a second `Map` in `lyrics/cdrom.ts`.
- Always GET `/cdrom/lyrics` first. Ignore stale `has_local_lyrics`.
- On Leave / eject / new disc, `dropLyricsMemory("cdrom:")`. Same `rel` on a new disc must not reuse the previous disc’s LRCLIB hit.
- Red Book rows do not grow a Change disc replacement. Lyrics toggle is offered only when the current row is `cdrom:`.
- Offline / `canReachServer() === false` skips LRCLIB and still shows local lyrics.
- Copy lyrics uses the same `lyricsClipboardText` path as the library.
- Do not teach `resolveLyrics(trackId)` about `cdrom:`.

## Risks

- Teaching `resolveLyrics(trackId)` to hit `/api/tracks/{id}` for `cdrom:` ids will 404-loop.
- Persisting LRCLIB into `track_lyrics` without a real track FK will corrupt scan lyrics.

## Implementation

### Files

- `src/musicweb/lyrics/lookup.py`
- `src/musicweb/routes/cd.py`
- `tests/cd/test_lyrics_lookup.py`
- `frontend/src/api.ts`
- `frontend/src/lyrics/cdrom.ts`
- `frontend/src/lyrics/cache.ts`
- `frontend/src/components/player/LyricsOverlay.vue`
- `frontend/src/components/player/NowPlayingView.vue`
- `frontend/src/components/cd/CdNowPlaying.vue`
- `frontend/src/stores/cd.ts`
- `frontend/tests/lyrics/cdromResolve.test.ts`
- `frontend/tests/lyrics/peekLyricsMemory.test.ts`

### Steps

1. Add `src/musicweb/lyrics/lookup.py`: `lookup_remote_lyrics(title, artist, album, duration_ms) -> LyricsResult` using `LrclibClient` + `match_fingerprint`. No `Session`, no `TrackLyrics` write. Honor `LYRICS_FETCH` and the existing interval constant.
2. `POST /api/cd/lyrics` on `src/musicweb/routes/cd.py` with body `{ title, artist, album, duration_ms }`. 200 with the same JSON shape as `GET /api/tracks/{id}/lyrics` (never 404 for not found).
3. Export `dropLyricsMemory(prefix: string)` from `frontend/src/lyrics/cache.ts` (delete keys that start with the prefix). Reuse `peekLyricsMemory` / the existing private `remember`.
4. `frontend/src/lyrics/cdrom.ts`: `resolveCdromLyrics(trackId: string)` looks up the row in `cd.tracks` by id. Memory → always GET companion `/cdrom/lyrics` → `POST /api/cd/lyrics` when `canReachServer()`. Reuse `lyrics_dict` / `fromApiLyrics` shape.
5. Add `fetchCdromLyrics` in `frontend/src/api.ts`. Do not send `cdrom:` ids through the library track-id lyrics helper.
6. `LyricsOverlay.vue`: optional `resolve?: (trackId: string) => Promise<Lyrics>` (default `resolveLyrics`). `NowPlayingView.vue` forwards the prop. `CdNowPlaying.vue` passes `trackId` (the `cdrom:` id), `lyricsOpen`, `@toggle-lyrics`, and `:resolve="resolveCdromLyrics"`. `showLyricsToggle` when the current row is `cdrom:`.
7. `leaveCdMode` / media-gone / `startCdromSession` on a new disc calls `dropLyricsMemory("cdrom:")`.
8. Tests: lookup does not touch the DB; 200 + `not_found`; client resolver does not call `/api/tracks/`; eject drops `cdrom:` memory keys.

### Verify

- `uv run pytest tests/cd/test_lyrics_lookup.py`
- `pnpm --dir frontend test -- frontend/tests/lyrics/cdromResolve.test.ts frontend/tests/lyrics/peekLyricsMemory.test.ts`
- `rg -n "track_lyrics|TrackLyrics" src/musicweb/lyrics/lookup.py src/musicweb/routes/cd.py` is empty.
- `rg -n "fetchLyrics\\(" frontend/src/lyrics/cdrom.ts` is empty.
- `rg -n "resolve\\?:" frontend/src/components/player/LyricsOverlay.vue` hits the optional prop.

## Acceptance

- A file with `{stem}.lrc` shows those lyrics without hitting LRCLIB.
- A tagged file with no local lyrics can show LRCLIB text while the server has no `tracks` row for it.
- Red Book now-playing still has no lyrics toggle.
- Eject / leave / new disc calls `dropLyricsMemory("cdrom:")`. A new disc that reuses `Music/01.mp3` does not show the previous disc’s LRCLIB hit.
